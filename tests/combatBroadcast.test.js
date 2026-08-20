import assert from 'assert/strict';
import { World } from '../modules/World.js';
import { loadStatDefinitions } from '../modules/content/loadStatDefinitions.js';
import { initStat } from '../modules/stats.js';
import { emit } from '../modules/events.js';
import { setWorld } from '../modules/combat/index.js'; // also registers the attack producer + message listeners

loadStatDefinitions();

function makeCharacter(name) {
    const written = [];
    const character = { name, components: {}, socket: { written, write: (msg) => written.push(msg) } };
    initStat(character, 'hp', 10);
    return character;
}

function lastMessage(character) {
    return character.socket.written[character.socket.written.length - 1];
}

const world = new World();
const room = world.getRoomById(world.addRoom('Arena', 'A place to fight'));

const attacker = makeCharacter('Attacker');
const defender = makeCharacter('Defender');
const bystander = makeCharacter('Bystander');
[attacker, defender, bystander].forEach(c => room.addCharacter(c));

setWorld(world);

// A miss reaches a room bystander too, in third person
{
    emit('attack', { attacker, defender, hit: false });
    assert.match(lastMessage(bystander), /Attacker swings at Defender and misses\./);
}

// A hit's damage message reaches a room bystander too
{
    emit('damage', { attacker, defender, amount: 3 });
    assert.match(lastMessage(bystander), /Attacker hits Defender for 3 damage!/);
}

// A defeat reaches a room bystander too
{
    emit('defeat', { character: defender, defeatedBy: attacker });
    assert.match(lastMessage(bystander), /Attacker has defeated Defender!/);
}

// The two direct combatants get exactly their own personal message, not a
// second, duplicate bystander one
{
    const beforeAttacker = attacker.socket.written.length;
    const beforeDefender = defender.socket.written.length;

    emit('attack', { attacker, defender, hit: false });

    assert.equal(attacker.socket.written.length, beforeAttacker + 1, 'attacker gets exactly one message');
    assert.equal(defender.socket.written.length, beforeDefender + 1, 'defender gets exactly one message');
}

// Without setWorld ever being called, the bystander broadcast just no-ops
// instead of throwing - other tests exercise combat events standalone.
{
    setWorld(null);
    assert.doesNotThrow(() => emit('attack', { attacker, defender, hit: false }));
}

console.log('All tests passed');
