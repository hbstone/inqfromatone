import assert from 'assert/strict';
import { World } from '../modules/World.js';
import { Room } from '../modules/Room.js';

const world = new World();

// addRoom should return a unique ID each time
const id1 = world.addRoom('Room A', 'First room');
const id2 = world.addRoom('Room B', 'Second room');
assert.notStrictEqual(id1, id2, 'addRoom should generate unique IDs');

// getRoomById should return the expected room object
const expectedRoom = new Room('Room A', 'First room');
expectedRoom.id = id1;
const roomById = world.getRoomById(id1);
assert.deepStrictEqual(roomById, expectedRoom, 'getRoomById should return the correct room');

// getRoomByName should return the same object
const roomByName = world.getRoomByName('Room A');
assert.deepStrictEqual(roomByName, expectedRoom, 'getRoomByName should return the correct room');

// getOnlineCharacterByName: fuzzy (substring) match, across every room,
// only among characters with a socket
{
    const online = { name: 'Alice', keywords: ['alice'], socket: {} };
    const offline = { name: 'Bob', keywords: ['bob'], socket: null };
    world.getRoomById(id1).addCharacter(online);
    world.getRoomById(id2).addCharacter(offline);

    assert.equal(world.getOnlineCharacterByName('ali'), online, 'substring match should find the online character');
    assert.equal(world.getOnlineCharacterByName('bob'), null, 'an offline character should not be found');
    assert.equal(world.getOnlineCharacterByName('nobody'), null);
}

console.log('All tests passed');
