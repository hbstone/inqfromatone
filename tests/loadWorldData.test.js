import assert from 'assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { World } from '../modules/World.js';
import { loadWorldData } from '../modules/content/loadWorldData.js';

// Writes a pack's content under root/<pack>/content and returns that path
// (a pack's name, which namespaces its ids, is the folder above content/).
// zones: { zoneKey: rooms[] | { zone, rooms } } - a bare rooms array gets a
// default zone.json.
function writePack(root, pack, zones, itemsData) {
    const contentDir = path.join(root, pack, 'content');
    fs.mkdirSync(contentDir, { recursive: true });
    fs.writeFileSync(path.join(contentDir, 'items.json'), JSON.stringify(itemsData));
    for (const [zoneKey, spec] of Object.entries(zones)) {
        const { zone = { name: zoneKey }, rooms } = Array.isArray(spec) ? { rooms: spec } : spec;
        const zoneDir = path.join(contentDir, 'zones', zoneKey);
        fs.mkdirSync(zoneDir, { recursive: true });
        fs.writeFileSync(path.join(zoneDir, 'zone.json'), JSON.stringify(zone));
        fs.writeFileSync(path.join(zoneDir, 'rooms.json'), JSON.stringify(rooms));
    }
    return contentDir;
}

function withTempRoot(fn) {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'load-world-data-'));
    try {
        return fn(root);
    } finally {
        fs.rmSync(root, { recursive: true, force: true });
    }
}

// A single pack, named "test".
function withFixtureDir(zones, itemsData, fn) {
    return withTempRoot((root) => fn(writePack(root, 'test', zones, itemsData)));
}

// Loading the real shipped content/ data should produce a working starting
// room, a second room connected by a real bidirectional exit, a cross-zone
// exit, and the seeded item in the right room's inventory. This doubles as
// a regression check that the shipped content files stay valid.
{
    const world = new World();
    const { startingRoomKey } = loadWorldData(world);

    assert.equal(startingRoomKey, 'starter/start/starting-room');

    const startingRoom = world.getRoomById('starter/start/starting-room');
    const hallway = world.getRoomById('starter/start/narrow-hallway');
    assert.ok(startingRoom, 'starting room should exist');
    assert.ok(hallway, 'second room should exist');

    assert.equal(startingRoom.exits.north, hallway.id, 'starting room should exit north into the hallway');
    assert.equal(hallway.exits.south, startingRoom.id, 'hallway should exit south back to the starting room');

    // A cross-zone exit both ways, and indoors from each zone's default
    const courtyard = world.getRoomById('starter/grounds/courtyard');
    assert.equal(startingRoom.exits.south, courtyard.id);
    assert.equal(courtyard.exits.north, startingRoom.id);
    assert.equal(startingRoom.zone, 'starter/start');
    assert.equal(courtyard.zone, 'starter/grounds');
    assert.equal(startingRoom.indoors, true);
    assert.equal(courtyard.indoors, false, 'no flag means outdoors');

    assert.equal(startingRoom.inventory.length, 1, 'starting room should have the seeded item');
    const [key] = startingRoom.inventory;
    assert.equal(key.name, 'a rusty key');
    assert.deepStrictEqual(key.keywords, ['rusty', 'key']);
    assert.equal(key.equip, null);

    // An item's "equip" survives loading, so content hats can be worn
    const storage = world.getRoomById('starter/start/storage-room');
    const hat = storage.inventory.find((item) => item.name === 'a fancy feathered hat');
    assert.deepStrictEqual(hat.equip, { slot: 'head' });
}

// A room exit pointing at an unknown room key, and an item reference
// pointing at an unknown item key, should be skipped with a warning rather
// than throwing or silently dropping everything else.
{
    const world = new World();
    const originalWarn = console.warn;
    const warnings = [];
    console.warn = (...args) => warnings.push(args.join(' '));

    let result;
    try {
        result = withFixtureDir(
            {
                solo: [
                    {
                        key: 'only-room',
                        name: 'Only Room',
                        description: 'The only room.',
                        isStartingRoom: true,
                        exits: { north: 'nowhere' },
                        items: ['missing-item'],
                    },
                ],
            },
            [],
            (fixtureDir) => loadWorldData(world, fixtureDir),
        );
    } finally {
        console.warn = originalWarn;
    }

    const onlyRoom = world.getRoomById('test/solo/only-room');
    assert.equal(result.startingRoomKey, 'test/solo/only-room');
    assert.ok(onlyRoom, 'the well-formed room should still load');
    assert.deepStrictEqual(onlyRoom.exits, {}, 'the bad exit reference should be skipped');
    assert.deepStrictEqual(onlyRoom.inventory, [], 'the bad item reference should be skipped');
    assert.ok(warnings.length >= 2, 'both the bad exit and bad item should be warned about');
}

// Repeated stackable item keys in a room's item list - the same "list it
// N times" convention used for non-stackable proof content elsewhere -
// collapse into one stack at load time instead of staying N separate
// objects; a non-stackable item repeated the same way stays N objects.
{
    const world = new World();
    withFixtureDir(
        {
            keep: [
                {
                    key: 'armory',
                    name: 'Armory',
                    description: 'An armory.',
                    isStartingRoom: true,
                    items: ['arrow', 'arrow', 'arrow', 'brick', 'brick'],
                },
            ],
        },
        [
            { key: 'arrow', name: 'an arrow', description: 'An arrow.', keywords: ['arrow'], stackable: true },
            { key: 'brick', name: 'a brick', description: 'A brick.', keywords: ['brick'] },
        ],
        (fixtureDir) => loadWorldData(world, fixtureDir),
    );

    const armory = world.getRoomById('test/keep/armory');
    const arrows = armory.inventory.filter((item) => item.name === 'an arrow');
    const bricks = armory.inventory.filter((item) => item.name === 'a brick');

    assert.equal(arrows.length, 1, 'stackable arrows should merge into one object');
    assert.equal(arrows[0].quantity, 3);
    assert.equal(bricks.length, 2, 'non-stackable bricks should stay separate objects');
}

// Two rooms sharing a key in one zone would otherwise silently clobber each
// other in World's id-keyed Map (and merge their exits/items onto whichever
// survived) - that's a data integrity error, not a dangling reference, so
// it must fail loudly instead.
{
    const world = new World();
    assert.throws(
        () =>
            withFixtureDir(
                {
                    halls: [
                        { key: 'dup', name: 'A Long Hallway', description: 'One.', isStartingRoom: true },
                        { key: 'dup', name: 'Also A Long Hallway', description: 'Two.' },
                    ],
                },
                [],
                (fixtureDir) => loadWorldData(world, fixtureDir),
            ),
        /Duplicate room \(zone "test\/halls"\) key "dup"/,
        'a duplicate room key should throw rather than silently merge',
    );
}

// Same for items: a duplicate key would make the second definition
// permanently unreachable (items.find always resolves to the first match).
{
    const world = new World();
    assert.throws(
        () =>
            withFixtureDir(
                { a: [{ key: 'room-a', name: 'Room A', description: 'A room.', isStartingRoom: true }] },
                [
                    { key: 'dup', name: 'a rusty key', description: 'One.', keywords: ['rusty'] },
                    { key: 'dup', name: 'a shiny key', description: 'Two.', keywords: ['shiny'] },
                ],
                (fixtureDir) => loadWorldData(world, fixtureDir),
            ),
        /Duplicate item key "test\/dup"/,
        'a duplicate item key should throw rather than silently shadow',
    );
}

// Zones: the same room key can exist in two zones; a bare exit stays in its
// own zone, a "zone/key" exit crosses over; a room's indoors setting
// overrides its zone's.
{
    const world = new World();
    const { startingRoomKey } = withFixtureDir(
        {
            town: {
                zone: { name: 'The Town' },
                rooms: [
                    {
                        key: 'gate',
                        name: 'Town Gate',
                        isStartingRoom: true,
                        exits: { north: 'square', east: 'woods/gate' },
                    },
                    { key: 'square', name: 'Town Square', exits: { south: 'gate' } },
                    { key: 'inn', name: 'The Inn', indoors: true },
                ],
            },
            woods: {
                zone: { name: 'The Woods', indoors: true },
                rooms: [
                    { key: 'gate', name: 'Woods Gate', exits: { west: 'town/gate' } },
                    { key: 'clearing', name: 'A Clearing', indoors: false },
                ],
            },
        },
        [],
        (fixtureDir) => loadWorldData(world, fixtureDir),
    );

    assert.equal(startingRoomKey, 'test/town/gate');
    assert.equal(world.getRoomById('test/town/gate').exits.north, 'test/town/square');
    assert.equal(world.getRoomById('test/town/gate').exits.east, 'test/woods/gate');
    assert.equal(world.getRoomById('test/woods/gate').exits.west, 'test/town/gate');
    assert.equal(world.getRoomById('test/woods/gate').name, 'Woods Gate', 'same key, different zone, different room');

    assert.equal(world.getRoomById('test/town/square').indoors, false, 'inherits the zone default (unset = outdoors)');
    assert.equal(world.getRoomById('test/town/inn').indoors, true, 'room overrides the zone');
    assert.equal(world.getRoomById('test/woods/gate').indoors, true);
    assert.equal(world.getRoomById('test/woods/clearing').indoors, false);

    assert.deepEqual(world.getZone('test/woods'), {
        key: 'test/woods',
        name: 'The Woods',
        description: '',
        indoors: true,
    });

    // Legacy lookup: an older id (pre-zone "square", pre-pack "town/square")
    // resolves only when unambiguous
    assert.equal(world.findRoomAllowingLegacyId('square').id, 'test/town/square');
    assert.equal(world.findRoomAllowingLegacyId('town/square').id, 'test/town/square');
    assert.equal(world.findRoomAllowingLegacyId('gate'), null, 'two zones have a gate');
    assert.equal(world.findRoomAllowingLegacyId('test/town/inn').id, 'test/town/inn');
    assert.equal(world.findRoomAllowingLegacyId('nowhere'), null);
}

// Packs: two packs can both have a "town" zone and a "rope" item. Bare
// references stay in their own pack; "zone/key" stays in the pack too; a
// full "pack/zone/key" id crosses over, and so does a "pack/key" item.
withTempRoot((root) => {
    const world = new World();
    const ropeItem = (name) => ({ key: 'rope', name, description: 'Rope.', keywords: ['rope'] });
    const fantasy = writePack(
        root,
        'fantasy',
        {
            town: [{ key: 'gate', name: 'Fantasy Gate', exits: { east: 'western/town/gate' }, items: ['rope'] }],
            woods: [{ key: 'clearing', name: 'Clearing', exits: { west: 'town/gate' } }],
        },
        [ropeItem('a hemp rope')],
    );
    const western = writePack(
        root,
        'western',
        {
            town: [
                {
                    key: 'gate',
                    name: 'Western Gate',
                    exits: { west: 'fantasy/town/gate' },
                    items: ['rope', 'fantasy/rope'],
                },
            ],
        },
        [ropeItem('a lariat')],
    );
    loadWorldData(world, [fantasy, western], { startingRoom: 'fantasy/town/gate' });

    const fantasyGate = world.getRoomById('fantasy/town/gate');
    const westernGate = world.getRoomById('western/town/gate');
    assert.equal(fantasyGate.name, 'Fantasy Gate');
    assert.equal(westernGate.name, 'Western Gate');
    assert.equal(fantasyGate.exits.east, westernGate.id);
    assert.equal(westernGate.exits.west, fantasyGate.id);
    assert.equal(
        world.getRoomById('fantasy/woods/clearing').exits.west,
        fantasyGate.id,
        '"zone/key" stays in its pack',
    );
    assert.deepEqual(
        fantasyGate.inventory.map((item) => item.name),
        ['a hemp rope'],
    );
    assert.deepEqual(
        westernGate.inventory.map((item) => item.name),
        ['a lariat', 'a hemp rope'],
    );
    assert.equal(world.findRoomAllowingLegacyId('town/gate'), null, 'both packs have a town/gate');
});

// Item overrides name the other pack's item by its full id; a "pack/key"
// without "override" is an error, and so is overriding nothing.
withTempRoot((root) => {
    const world = new World();
    const base = writePack(root, 'base', { hall: [{ key: 'hall', name: 'Hall', items: ['rope'] }] }, [
        { key: 'rope', name: 'a rope', description: 'Rope.', keywords: ['rope'] },
    ]);
    const better = writePack(root, 'better', {}, [
        { key: 'base/rope', override: true, name: 'a silk rope', description: 'Silk.', keywords: ['rope'] },
    ]);
    loadWorldData(world, [base, better]);
    assert.equal(world.getRoomById('base/hall/hall').inventory[0].name, 'a silk rope');

    const sneaky = writePack(root, 'sneaky', {}, [{ key: 'base/rope', name: 'a fake rope', description: '' }]);
    assert.throws(() => loadWorldData(new World(), [base, sneaky]), /only an "override": true entry may do/);
    const typo = writePack(root, 'typo', {}, [{ key: 'base/rpoe', override: true, name: 'x', description: '' }]);
    assert.throws(() => loadWorldData(new World(), [base, typo]), /marked "override" but nothing defines it/);
});

// The game's startingRoom must be a full id
withTempRoot((root) => {
    const pack = writePack(root, 'solo', { town: [{ key: 'gate', name: 'Gate' }] }, []);
    assert.throws(
        () => loadWorldData(new World(), pack, { startingRoom: 'town/gate' }),
        /needs the full "pack\/zone\/room" id/,
    );
});

// Pack, zone and room keys become save-file paths, so they must be filename-safe
{
    assert.throws(
        () =>
            withFixtureDir({ 'Bad Zone': [{ key: 'room', name: 'Room' }] }, [], (dir) =>
                loadWorldData(new World(), dir),
            ),
        /Invalid zone key "Bad Zone"/,
    );
    assert.throws(
        () =>
            withFixtureDir({ ok: [{ key: '../escape', name: 'Room' }] }, [], (dir) => loadWorldData(new World(), dir)),
        /Invalid room key "\.\.\/escape"/,
    );
}

console.log('All tests passed');
