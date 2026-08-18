import assert from 'assert/strict';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { World } from '../modules/World.js';
import { Character } from '../modules/Character.js';
import { disconnectCharacter } from '../modules/commands/quit.js';

const CHARACTERS_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'characters');
const saveFile = path.join(CHARACTERS_DIR, 'disconnecttestfixture.json');

try {
    const world = new World();
    const roomId = world.addRoom('Room', 'A room.');
    const room = world.getRoomById(roomId);

    const leaver = new Character('DisconnectTestFixture', 'Leaving.');
    room.addCharacter(leaver);

    const bystanderMessages = [];
    const bystander = new Character('Bystander');
    bystander.socket = { write: (msg) => bystanderMessages.push(msg) };
    room.addCharacter(bystander);

    disconnectCharacter(world, leaver, 'DisconnectTestFixture has disconnected.');

    // Removed from the room and saved
    assert.ok(!room.characters.includes(leaver), 'the leaver should be removed from the room');
    assert.equal(leaver.roomId, null);
    assert.ok(fs.existsSync(saveFile), 'disconnecting should persist the character');

    // Bystander (with a socket) got the departure broadcast
    assert.ok(
        bystanderMessages.some(m => m.includes('DisconnectTestFixture has disconnected.')),
        'other characters in the room should be notified'
    );

    // Calling it again (e.g. quit's own socket.end() re-firing the "end"
    // event) must be a safe no-op, not throw - this is exactly the bug
    // that crashed the server: roomId is already null, so world.getRoomById
    // returns null, and the old code unconditionally did room.characters.forEach.
    assert.doesNotThrow(
        () => disconnectCharacter(world, leaver, 'DisconnectTestFixture has disconnected.'),
        'disconnecting an already-disconnected character must not throw'
    );
} finally {
    fs.rmSync(saveFile, { force: true });
}

console.log('All tests passed');
