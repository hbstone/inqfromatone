import assert from 'assert/strict';
import { World } from '../modules/World.js';
import { Character } from '../modules/Character.js';
import { look } from '../modules/commands/look.js';
import { stripColors } from '../modules/color.js';

function setup() {
    const world = new World();
    const roomId = world.addRoom('Town Square', 'A dusty square.');
    const room = world.getRoomById(roomId);
    const character = new Character('Alice');
    room.addCharacter(character);
    return { world, room, character };
}

// A plain `look` (no args) lists the room's exits, alongside
// characters/items - look returns raw color tokens (see modules/color.js),
// not rendered ANSI or stripped text; that happens later, in
// writeToSocket. stripColors lets this test read past them either way.
{
    const { world, room, character } = setup();
    room.exits.north = 'somewhere';
    room.exits.east = 'somewhere-else';

    const result = stripColors(look(world, [], character));
    assert.match(result, /Exits: north, east/);
}

// A room with no exits shows "None", matching the existing
// characters/items "None" fallback
{
    const { world, character } = setup();

    const result = stripColors(look(world, [], character));
    assert.match(result, /Exits: None/);
}

// The room name and field labels (Exits:/Characters here:/Items here:)
// carry color tokens - the one thing this QoL pass explicitly wanted
// visually differentiated
{
    const { world, character } = setup();

    const result = look(world, [], character);
    assert.match(result, /^\{CTown Square\{x/, 'room name is colored');
    assert.match(result, /\{YExits:\{x/, '"Exits:" label is colored');
    assert.match(result, /\{YCharacters here:\{x/, '"Characters here:" label is colored');
    assert.match(result, /\{YItems here:\{x/, '"Items here:" label is colored');
}

console.log('All tests passed');
