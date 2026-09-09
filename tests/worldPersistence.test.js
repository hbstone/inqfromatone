import assert from 'assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { World } from '../modules/World.js';
import { Item } from '../modules/Item.js';
import { loadRoomStates, saveDirtyRooms } from '../modules/worldPersistence.js';
import { roomStateExists, loadRoomState } from '../worldData.js';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'world-persistence-'));

try {
    // saveDirtyRooms only writes rooms actually marked dirty - a tick with
    // nothing changed writes nothing, and a single changed room writes only
    // that one room's file
    {
        const world = new World();
        const idA = world.addRoom('Room A', 'First room', 'room-a');
        const idB = world.addRoom('Room B', 'Second room', 'room-b');

        saveDirtyRooms(world, dir);
        assert.equal(roomStateExists(idA, dir), false, 'nothing dirty yet, nothing should be written');
        assert.equal(roomStateExists(idB, dir), false);

        world.getRoomById(idA).inventory.push(new Item('a pouch', 'A small pouch.', ['pouch']));
        world.getRoomById(idA).markDirty();

        saveDirtyRooms(world, dir);
        assert.equal(roomStateExists(idA, dir), true, 'the dirty room should be saved');
        assert.equal(roomStateExists(idB, dir), false, 'the untouched room should not be written at all');
        assert.equal(world.getRoomById(idA).dirty, false, 'saving should clear the dirty flag');

        assert.deepStrictEqual(loadRoomState(idA, dir).inventory.map(i => i.name), ['a pouch']);
    }

    // loadRoomStates overlays saved state onto the content-seeded defaults,
    // and leaves a room with no save file untouched
    {
        const world = new World();
        const idA = world.addRoom('Room A', 'First room', 'room-a');
        const idB = world.addRoom('Room B', 'Second room', 'room-b');
        world.getRoomById(idA).inventory.push(new Item('a rusty key', 'An old key.', ['rusty', 'key']));
        world.getRoomById(idB).inventory.push(new Item('a torch', 'A lit torch.', ['torch']));

        loadRoomStates(world, dir); // room-a has a save from the block above; room-b doesn't

        assert.deepStrictEqual(
            world.getRoomById(idA).inventory.map(i => i.name),
            ['a pouch'],
            'room-a should be overlaid with its saved state'
        );
        assert.deepStrictEqual(
            world.getRoomById(idB).inventory.map(i => i.name),
            ['a torch'],
            'room-b has no save yet, so its content-seeded default should be untouched'
        );
        assert.equal(world.getRoomById(idA).dirty, false, 'a freshly-loaded room should not be dirty');
    }
} finally {
    fs.rmSync(dir, { recursive: true, force: true });
}

console.log('All tests passed');
