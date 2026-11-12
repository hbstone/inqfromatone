import assert from 'assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { World } from '../modules/World.js';
import { loadWorldData } from '../modules/content/loadWorldData.js';

// zones: { zoneKey: rooms[] | { zone, rooms } } - a bare rooms array gets a
// default zone.json.
function withFixtureDir(zones, itemsData, fn) {
    const fixtureDir = fs.mkdtempSync(path.join(os.tmpdir(), 'load-world-data-'));
    fs.writeFileSync(path.join(fixtureDir, 'items.json'), JSON.stringify(itemsData));
    for (const [zoneKey, spec] of Object.entries(zones)) {
        const { zone = { name: zoneKey }, rooms } = Array.isArray(spec) ? { rooms: spec } : spec;
        const zoneDir = path.join(fixtureDir, 'zones', zoneKey);
        fs.mkdirSync(zoneDir, { recursive: true });
        fs.writeFileSync(path.join(zoneDir, 'zone.json'), JSON.stringify(zone));
        fs.writeFileSync(path.join(zoneDir, 'rooms.json'), JSON.stringify(rooms));
    }
    try {
        return fn(fixtureDir);
    } finally {
        fs.rmSync(fixtureDir, { recursive: true, force: true });
    }
}

// Loading the real shipped content/ data should produce a working starting
// room, a second room connected by a real bidirectional exit, a cross-zone
// exit, and the seeded item in the right room's inventory. This doubles as
// a regression check that the shipped content files stay valid.
{
    const world = new World();
    const { startingRoomKey } = loadWorldData(world);

    assert.equal(startingRoomKey, 'start/starting-room');

    const startingRoom = world.getRoomById('start/starting-room');
    const hallway = world.getRoomById('start/narrow-hallway');
    assert.ok(startingRoom, 'starting room should exist');
    assert.ok(hallway, 'second room should exist');

    assert.equal(startingRoom.exits.north, hallway.id, 'starting room should exit north into the hallway');
    assert.equal(hallway.exits.south, startingRoom.id, 'hallway should exit south back to the starting room');

    // A cross-zone exit both ways, and indoors from each zone's default
    const courtyard = world.getRoomById('grounds/courtyard');
    assert.equal(startingRoom.exits.south, courtyard.id);
    assert.equal(courtyard.exits.north, startingRoom.id);
    assert.equal(startingRoom.zone, 'start');
    assert.equal(courtyard.zone, 'grounds');
    assert.equal(startingRoom.indoors, true);
    assert.equal(courtyard.indoors, false, 'no flag means outdoors');

    assert.equal(startingRoom.inventory.length, 1, 'starting room should have the seeded item');
    const [key] = startingRoom.inventory;
    assert.equal(key.name, 'a rusty key');
    assert.deepStrictEqual(key.keywords, ['rusty', 'key']);
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
                solo: [{
                    key: 'only-room',
                    name: 'Only Room',
                    description: 'The only room.',
                    isStartingRoom: true,
                    exits: { north: 'nowhere' },
                    items: ['missing-item'],
                }],
            },
            [],
            (fixtureDir) => loadWorldData(world, fixtureDir)
        );
    } finally {
        console.warn = originalWarn;
    }

    const onlyRoom = world.getRoomById('solo/only-room');
    assert.equal(result.startingRoomKey, 'solo/only-room');
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
            keep: [{
                key: 'armory',
                name: 'Armory',
                description: 'An armory.',
                isStartingRoom: true,
                items: ['arrow', 'arrow', 'arrow', 'brick', 'brick'],
            }],
        },
        [
            { key: 'arrow', name: 'an arrow', description: 'An arrow.', keywords: ['arrow'], stackable: true },
            { key: 'brick', name: 'a brick', description: 'A brick.', keywords: ['brick'] },
        ],
        (fixtureDir) => loadWorldData(world, fixtureDir)
    );

    const armory = world.getRoomById('keep/armory');
    const arrows = armory.inventory.filter(item => item.name === 'an arrow');
    const bricks = armory.inventory.filter(item => item.name === 'a brick');

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
        () => withFixtureDir(
            {
                halls: [
                    { key: 'dup', name: 'A Long Hallway', description: 'One.', isStartingRoom: true },
                    { key: 'dup', name: 'Also A Long Hallway', description: 'Two.' },
                ],
            },
            [],
            (fixtureDir) => loadWorldData(world, fixtureDir)
        ),
        /Duplicate room \(zone "halls"\) key "dup"/,
        'a duplicate room key should throw rather than silently merge'
    );
}

// Same for items: a duplicate key would make the second definition
// permanently unreachable (items.find always resolves to the first match).
{
    const world = new World();
    assert.throws(
        () => withFixtureDir(
            { a: [{ key: 'room-a', name: 'Room A', description: 'A room.', isStartingRoom: true }] },
            [
                { key: 'dup', name: 'a rusty key', description: 'One.', keywords: ['rusty'] },
                { key: 'dup', name: 'a shiny key', description: 'Two.', keywords: ['shiny'] },
            ],
            (fixtureDir) => loadWorldData(world, fixtureDir)
        ),
        /Duplicate item key "dup"/,
        'a duplicate item key should throw rather than silently shadow'
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
                    { key: 'gate', name: 'Town Gate', isStartingRoom: true, exits: { north: 'square', east: 'woods/gate' } },
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
        (fixtureDir) => loadWorldData(world, fixtureDir)
    );

    assert.equal(startingRoomKey, 'town/gate');
    assert.equal(world.getRoomById('town/gate').exits.north, 'town/square');
    assert.equal(world.getRoomById('town/gate').exits.east, 'woods/gate');
    assert.equal(world.getRoomById('woods/gate').exits.west, 'town/gate');
    assert.equal(world.getRoomById('woods/gate').name, 'Woods Gate', 'same key, different zone, different room');

    assert.equal(world.getRoomById('town/square').indoors, false, 'inherits the zone default (unset = outdoors)');
    assert.equal(world.getRoomById('town/inn').indoors, true, 'room overrides the zone');
    assert.equal(world.getRoomById('woods/gate').indoors, true);
    assert.equal(world.getRoomById('woods/clearing').indoors, false);

    assert.deepEqual(world.getZone('woods'), { key: 'woods', name: 'The Woods', description: '', indoors: true });

    // Legacy (pre-zone) lookup: a bare key resolves only when unambiguous
    assert.equal(world.findRoomAllowingLegacyId('square').id, 'town/square');
    assert.equal(world.findRoomAllowingLegacyId('gate'), null, 'two zones have a gate');
    assert.equal(world.findRoomAllowingLegacyId('town/inn').id, 'town/inn');
    assert.equal(world.findRoomAllowingLegacyId('nowhere'), null);
}

// Zone and room keys become save-file paths, so they must be filename-safe
{
    assert.throws(
        () => withFixtureDir({ 'Bad Zone': [{ key: 'room', name: 'Room' }] }, [], (dir) => loadWorldData(new World(), dir)),
        /Invalid zone key "Bad Zone"/
    );
    assert.throws(
        () => withFixtureDir({ ok: [{ key: '../escape', name: 'Room' }] }, [], (dir) => loadWorldData(new World(), dir)),
        /Invalid room key "\.\.\/escape"/
    );
}

console.log('All tests passed');
