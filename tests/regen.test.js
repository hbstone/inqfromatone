import assert from 'assert/strict';
import { mock } from 'node:test';
import { World } from '../modules/World.js';
import { loadStatDefinitions } from '../modules/content/loadStatDefinitions.js';
import { initStat, getStatValue } from '../modules/stats.js';
import { startRegenTicker } from '../modules/combat/regen.js';

loadStatDefinitions(); // real content/stats/attributes.json - "vitality" -> "hp", startingValue 10

function makeCharacter(name, hp, online = true) {
    const character = { name, components: {}, socket: online ? {} : null };
    initStat(character, 'hp', hp);
    return character;
}

function makeRoomWith(world, ...characters) {
    const room = world.getRoomById(world.addRoom('Room', 'A room'));
    characters.forEach(c => room.addCharacter(c));
    return room;
}

// Online characters regen by 1 every 30s; offline ones (no socket) don't
{
    mock.timers.enable({ apis: ['setInterval'] });

    const world = new World();
    const online = makeCharacter('Online', 5);
    const offline = makeCharacter('Offline', 5, false);
    makeRoomWith(world, online, offline);

    const handle = startRegenTicker(world);
    mock.timers.tick(30000);

    assert.equal(getStatValue(online, 'hp'), 6, 'online character should regen');
    assert.equal(getStatValue(offline, 'hp'), 5, 'offline character should not regen');

    clearInterval(handle);
    mock.timers.reset();
}

// Capped at the stat's defined starting value - never overshoots
{
    mock.timers.enable({ apis: ['setInterval'] });

    const world = new World();
    const full = makeCharacter('Full', 10); // already at the starting value
    makeRoomWith(world, full);

    const handle = startRegenTicker(world);
    mock.timers.tick(30000);

    assert.equal(getStatValue(full, 'hp'), 10, 'should not exceed the starting-value cap');

    clearInterval(handle);
    mock.timers.reset();
}

// Keeps healing tick over tick, then holds once it hits the cap
{
    mock.timers.enable({ apis: ['setInterval'] });

    const world = new World();
    const recovering = makeCharacter('Recovering', 8);
    makeRoomWith(world, recovering);

    const handle = startRegenTicker(world);
    mock.timers.tick(30000);
    assert.equal(getStatValue(recovering, 'hp'), 9);
    mock.timers.tick(30000);
    assert.equal(getStatValue(recovering, 'hp'), 10);
    mock.timers.tick(30000);
    assert.equal(getStatValue(recovering, 'hp'), 10, 'stays capped once at the starting value');

    clearInterval(handle);
    mock.timers.reset();
}

console.log('All tests passed');
