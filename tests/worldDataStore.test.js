import assert from 'assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { roomStateExists, loadRoomState, saveRoomState } from '../worldData.js';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'world-data-'));

try {
    // No file yet
    assert.equal(roomStateExists('starting-room', dir), false);
    assert.equal(loadRoomState('starting-room', dir), null);

    // Save, then round-trip load
    saveRoomState('starting-room', { inventory: [{ name: 'a rusty key' }], components: {} }, dir);
    assert.equal(roomStateExists('starting-room', dir), true);
    assert.deepStrictEqual(loadRoomState('starting-room', dir), { inventory: [{ name: 'a rusty key' }], components: {} });

    // Overwriting a save replaces the previous content, not merges it
    saveRoomState('starting-room', { inventory: [], components: {} }, dir);
    assert.deepStrictEqual(loadRoomState('starting-room', dir), { inventory: [], components: {} });

    // A different room key is a distinct record
    assert.equal(roomStateExists('narrow-hallway', dir), false);
    saveRoomState('narrow-hallway', { inventory: [{ name: 'a pouch' }], components: {} }, dir);
    assert.deepStrictEqual(loadRoomState('starting-room', dir), { inventory: [], components: {} });
    assert.deepStrictEqual(loadRoomState('narrow-hallway', dir), { inventory: [{ name: 'a pouch' }], components: {} });
} finally {
    fs.rmSync(dir, { recursive: true, force: true });
}

console.log('All tests passed');
