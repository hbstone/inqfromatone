import assert from 'assert/strict';
import { World } from '../modules/World.js';
import { Character } from '../modules/Character.js';
import { findInWorldCharacter, takeOverConnection } from '../modules/connection.js';
import { writeToSocket } from '../modules/utils.js';

function fakeSocket() {
    const socket = { messages: [], ended: false };
    socket.write = (msg) => socket.messages.push(msg);
    socket.end = () => { socket.ended = true; };
    return socket;
}

// Exact (case-insensitive) name lookup - never fuzzy
{
    const world = new World();
    const room = world.getRoomById(world.addRoom('Room', 'A room.'));
    room.addCharacter(new Character('Bob'));

    assert.equal(findInWorldCharacter(world, 'bob')?.name, 'Bob');
    assert.equal(findInWorldCharacter(world, 'Bo'), null, '"Bo" must not resolve to an online "Bob"');
}

// Taking over keeps the live character, moves it to the new socket, and
// detaches + closes the old one
{
    const character = new Character('Bob');
    character.isLoggedIn = true;
    character.inventory.push('live state');
    const oldSocket = fakeSocket();
    character.socket = oldSocket;
    oldSocket.character = character;

    const newSocket = fakeSocket();
    takeOverConnection(character, newSocket);

    assert.equal(character.socket, newSocket);
    assert.equal(newSocket.character, character);
    assert.deepStrictEqual(character.inventory, ['live state'], 'live state is kept, not reloaded');

    assert.notEqual(oldSocket.character, character, 'the old socket no longer drives the character');
    assert.equal(oldSocket.character.isLoggedIn, false);
    assert.equal(oldSocket.character.stage, null, 'further input on the old socket is ignored');
    assert.ok(oldSocket.messages.some(m => m.includes('another connection')));
    assert.equal(oldSocket.ended, true);
}

// Writes to a closed socket are skipped, not attempted
{
    const socket = fakeSocket();
    socket.destroyed = true;
    writeToSocket(socket, 'hello');
    assert.deepStrictEqual(socket.messages, []);
}

console.log('All tests passed');
