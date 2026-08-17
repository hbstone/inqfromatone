import assert from 'assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { World } from '../modules/World.js';
import { loadWorldData } from '../modules/content/loadWorldData.js';

// Loading the real shipped content/ data should produce a working starting
// room, a second room connected by a real bidirectional exit, and the
// seeded item in the right room's inventory. This doubles as a regression
// check that the shipped content files stay valid.
{
    const world = new World();
    const { startingRoomKey } = loadWorldData(world);

    assert.equal(startingRoomKey, 'starting-room');

    const startingRoom = world.getRoomById('starting-room');
    const hallway = world.getRoomById('narrow-hallway');
    assert.ok(startingRoom, 'starting room should exist');
    assert.ok(hallway, 'second room should exist');

    assert.equal(startingRoom.exits.north, hallway.id, 'starting room should exit north into the hallway');
    assert.equal(hallway.exits.south, startingRoom.id, 'hallway should exit south back to the starting room');

    assert.equal(startingRoom.inventory.length, 1, 'starting room should have the seeded item');
    const [key] = startingRoom.inventory;
    assert.equal(key.name, 'a rusty key');
    assert.deepStrictEqual(key.keywords, ['rusty', 'key']);
}

// A room exit pointing at an unknown room key, and an item reference
// pointing at an unknown item key, should be skipped with a warning rather
// than throwing or silently dropping everything else.
{
    const fixtureDir = fs.mkdtempSync(path.join(os.tmpdir(), 'load-world-data-'));
    fs.writeFileSync(path.join(fixtureDir, 'rooms.json'), JSON.stringify([
        {
            key: 'only-room',
            name: 'Only Room',
            description: 'The only room.',
            isStartingRoom: true,
            exits: { north: 'nowhere' },
            items: ['missing-item'],
        },
    ]));
    fs.writeFileSync(path.join(fixtureDir, 'items.json'), JSON.stringify([]));

    const world = new World();
    const originalWarn = console.warn;
    const warnings = [];
    console.warn = (...args) => warnings.push(args.join(' '));

    let result;
    try {
        result = loadWorldData(world, fixtureDir);
    } finally {
        console.warn = originalWarn;
        fs.rmSync(fixtureDir, { recursive: true, force: true });
    }

    const onlyRoom = world.getRoomById('only-room');
    assert.equal(result.startingRoomKey, 'only-room');
    assert.ok(onlyRoom, 'the well-formed room should still load');
    assert.deepStrictEqual(onlyRoom.exits, {}, 'the bad exit reference should be skipped');
    assert.deepStrictEqual(onlyRoom.inventory, [], 'the bad item reference should be skipped');
    assert.ok(warnings.length >= 2, 'both the bad exit and bad item should be warned about');
}

console.log('All tests passed');
