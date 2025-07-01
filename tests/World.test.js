import assert from 'assert/strict';
import { World } from '../modules/World.js';

const world = new World();

// addRoom should return a unique ID each time
const id1 = world.addRoom('Room A', 'First room');
const id2 = world.addRoom('Room B', 'Second room');
assert.notStrictEqual(id1, id2, 'addRoom should generate unique IDs');

// getRoomById should return the expected room object
const expectedRoom = {
    id: id1,
    name: 'Room A',
    description: 'First room',
    characters: [],
    inventory: [],
    exits: {}
};
const roomById = world.getRoomById(id1);
assert.deepStrictEqual(roomById, expectedRoom, 'getRoomById should return the correct room');

// getRoomByName should return the same object
const roomByName = world.getRoomByName('Room A');
assert.deepStrictEqual(roomByName, expectedRoom, 'getRoomByName should return the correct room');

console.log('All tests passed');
