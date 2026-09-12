import assert from 'assert/strict';
import { World } from '../modules/World.js';
import { Character } from '../modules/Character.js';
import { movePlayer } from '../modules/commands/move.js';
import { stripColors } from '../modules/color.js';

function setup() {
    const world = new World();
    const startId = world.addRoom('Start Room', 'Where you begin.');
    const destId = world.addRoom('Dest Room', 'Where you end up.');
    const start = world.getRoomById(startId);
    const dest = world.getRoomById(destId);
    start.exits.north = destId;
    dest.exits.south = startId;
    dest.exits.east = 'somewhere';

    const character = new Character('Alice');
    start.addCharacter(character);

    return { world, start, dest, character };
}

// Moving into a room reports that room's exits, not the one just left -
// movePlayer returns raw color tokens (see modules/color.js), rendered
// later at writeToSocket; stripColors lets this test read past them.
{
    const { world, start, character } = setup();

    const result = stripColors(movePlayer(world, character, start, 'north', 'south'));
    assert.match(result, /Exits: south, east/);
}

// A destination room with no exits shows "None"
{
    const world = new World();
    const startId = world.addRoom('Start Room', 'Where you begin.');
    const deadEndId = world.addRoom('Dead End', 'Nowhere else to go.');
    const start = world.getRoomById(startId);
    start.exits.north = deadEndId;

    const character = new Character('Alice');
    start.addCharacter(character);

    const result = stripColors(movePlayer(world, character, start, 'north', 'south'));
    assert.match(result, /Exits: None/);
}

// The destination room's name is colored too
{
    const { world, start, character } = setup();

    const result = movePlayer(world, character, start, 'north', 'south');
    assert.match(result, /\{CDest Room\{x/);
}

console.log('All tests passed');
