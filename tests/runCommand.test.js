import assert from 'assert/strict';
import { World } from '../modules/World.js';
import { Npc } from '../modules/Npc.js';
import '../modules/commands/index.js';
import { runCommand, COMMAND_ERROR } from '../modules/commands/runCommand.js';
import { registerCommand } from '../modules/commands/registry.js';
import { makeCharacter, lastMessage } from './helpers.js';

function setUp() {
    const world = new World();
    const saloonId = world.addRoom('Saloon', 'A saloon.', 'test/town/saloon');
    const streetId = world.addRoom('Street', 'A street.', 'test/town/street');
    world.getRoomById(saloonId).exits.north = streetId;
    world.getRoomById(streetId).exits.south = saloonId;
    const room = world.getRoomById(saloonId);
    const alice = makeCharacter('Alice');
    const bartender = new Npc({ id: 'test/town/bartender', name: 'a mustachioed bartender' }, saloonId);
    room.addCharacter(alice);
    room.addCharacter(bartender);
    return { world, room, alice, bartender, streetId };
}

// An NPC runs verbs the way a player does: the room sees it, and the
// result comes back to whoever asked it to (no socket needed)
{
    const { world, alice, bartender, streetId } = setUp();
    assert.equal(runCommand(world, bartender, 'say Evening.'), 'You say, "Evening."');
    assert.equal(lastMessage(alice), 'A mustachioed bartender says, "Evening."');
    runCommand(world, bartender, 'n');
    assert.equal(bartender.roomId, streetId);
    assert.equal(runCommand(world, bartender, 'quit'), "There's no quitting for you.");
}

// `allowed` scopes what may run, by the command an input resolves to
{
    const { world, bartender } = setUp();
    const allowed = ['say', 'emote'];
    assert.equal(runCommand(world, bartender, 'say Hm.', { allowed }), 'You say, "Hm."');
    assert.equal(runCommand(world, bartender, 'n', { allowed }), "I don't understand that command.");
    assert.equal(runCommand(world, bartender, 'north', { allowed }), "I don't understand that command.");
    assert.equal(runCommand(world, bartender, 'frobnicate'), "I don't understand that command.");
}

// `n?` explains; a throwing command costs only itself
{
    const { world, alice } = setUp();
    assert.equal(runCommand(world, alice, 'n?'), '"n" is north.');
    registerCommand('zzbreak', () => {
        throw new Error('broken');
    });
    const errors = console.error;
    console.error = () => {};
    try {
        assert.equal(runCommand(world, alice, 'zzbreak'), COMMAND_ERROR);
    } finally {
        console.error = errors;
    }
}
