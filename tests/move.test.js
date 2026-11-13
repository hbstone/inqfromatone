import assert from 'assert/strict';
import { World } from '../modules/World.js';
import { Character } from '../modules/Character.js';
import { movePlayer } from '../modules/commands/move.js';
import { stripColors } from '../modules/color.js';
import { on } from '../modules/events.js';

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

// Arriving lists who's there (PCs and NPCs, not yourself), but not items
{
    const { world, start, dest, character } = setup();
    const bob = new Character('Bob');
    dest.addCharacter(bob);
    dest.inventory.push({ name: 'a rock' });

    const result = stripColors(movePlayer(world, character, start, 'north', 'south'));
    assert.match(result, /\nBob is here\.$/);
    assert.ok(!result.includes('Alice'), 'not yourself');
    assert.ok(!result.includes('Items here'), 'items wait for look');

    const empty = stripColors(movePlayer(world, bob, dest, 'south', 'north'));
    assert.match(empty, /Exits: north$/, 'nobody else here: no character lines');
}

// The destination room's name is colored too
{
    const { world, start, character } = setup();

    const result = movePlayer(world, character, start, 'north', 'south');
    assert.match(result, /\{CDest Room\{x/);
}

// Crossing into another zone emits zoneLeave/zoneEnter, nested inside the
// room events; a move within one zone doesn't. Core prints nothing for them.
{
    const world = new World();
    world.addZone('town', { name: 'The Town' });
    world.addZone('woods', { name: 'The Woods' });
    const [gate, square, edge] = [
        ['town/gate', 'town'],
        ['town/square', 'town'],
        ['woods/edge', 'woods'],
    ].map(([id, zone]) => {
        world.addRoom(id, `${id} description`, id);
        const room = world.getRoomById(id);
        room.zone = zone;
        return room;
    });
    gate.exits.north = square.id;
    square.exits.east = edge.id;

    const character = new Character('Alice');
    gate.addCharacter(character);

    const seen = [];
    for (const name of ['leaveRoom', 'zoneLeave', 'zoneEnter', 'enterRoom']) {
        on(name, (payload) => {
            if (payload.character !== character) return;
            const zones = name.startsWith('zone') ? ` ${payload.zone.key} (${(payload.to ?? payload.from).key})` : '';
            seen.push(name + zones);
        });
    }

    movePlayer(world, character, gate, 'north', 'south');
    assert.deepEqual(seen, ['leaveRoom', 'enterRoom'], 'same zone: room events only');

    seen.length = 0;
    const result = stripColors(movePlayer(world, character, square, 'east', 'west'));
    assert.deepEqual(seen, ['leaveRoom', 'zoneLeave town (woods)', 'zoneEnter woods (town)', 'enterRoom']);
    assert.ok(!result.includes('The Woods'), 'no zone name in the output');
}

console.log('All tests passed');
