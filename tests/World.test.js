import assert from 'assert/strict';
import { World } from '../modules/World.js';

const world = new World();

// addRoom should return a unique ID each time
const id1 = world.addRoom('Room A', 'First room');
const id2 = world.addRoom('Room B', 'Second room');
assert.notStrictEqual(id1, id2, 'addRoom should generate unique IDs');

// getRoomById should return the same room object as getRoomByName
const roomById = world.getRoomById(id1);
const roomByName = world.getRoomByName('Room A');
assert.deepStrictEqual(roomById, roomByName, 'getRoomById and getRoomByName should return the same room');

console.log('All tests passed');
