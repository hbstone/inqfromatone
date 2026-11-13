// The current combat content pack (see ARCHITECTURE.md's Combat section) -
// same framing as modules/checks/index.js and modules/commands/index.js:
// a real, working default so the plumbing (registry, session engine,
// events) is proven against something, not left theoretical. Moves under
// a real content pack once Phase 4 builds one.
//
// Ships the one attack anyone can throw right now - an unarmed strike, or
// a wielded weapon's damage if one's equipped - plus the player-facing
// messages for what an auto-attack did. Requires setWorld() (called once
// from game.js) to reach room bystanders - the two combatants get their
// direct messages regardless.
import { registerAttackProducer } from './registry.js';
import { nameFor, tellRoom } from '../naming.js';
import { getStatKeyForRole } from '../content/loadStatDefinitions.js';
import { getStatValue } from '../stats.js';
import { on } from '../events.js';
import { writeToSocket } from '../utils.js';

const UNARMED_DAMAGE = 1;

// `weapon` is a combat-pack-recognized equipment slot, same status as the
// `offense`/`defense`/`vitality` stat roles just below - core's equipment
// mechanism (modules/equipment.js) never enumerates slot names itself,
// this is the one place that cares what "weapon" means. A weapon's own
// damage is theme data on the item, `components.weapon.damage` (see
// ARCHITECTURE.md's component-bag example), not anything equipment.js or
// this producer's shape needs to know about beyond reading it.
function getAttackDamage(attacker) {
    return attacker.equipment?.weapon?.components?.weapon?.damage ?? UNARMED_DAMAGE;
}

registerAttackProducer((attacker, defender) => ({
    statKey: getStatKeyForRole('offense'),
    context: { difficulty: getStatValue(defender, getStatKeyForRole('defense')) },
    damage: getAttackDamage(attacker),
}));

let world = null;

/**
 * Give this module a way to resolve a combatant's room, so combat
 * messages can reach bystanders instead of just the two direct
 * participants. Call once at startup (see game.js); the "attack"/
 * "damage"/"defeat" listeners below no-op the bystander broadcast if
 * this was never called (e.g. in tests that exercise them standalone).
 * @param {import("../World.js").World} w
 */
export function setWorld(w) {
    world = w;
}

// Bystander version of a combat message, sent to everyone else in the
// room a combatant is standing in (both combatants already got their own
// direct message, so they're excluded). Assumes the two combatants share
// a room, true for every way v1 can start or continue a fight.
function broadcastToRoom(character, render, exclude) {
    const room = world?.getRoomById(character.roomId);
    if (room) {
        tellRoom(room, render, exclude);
    }
}

on('attack', ({ attacker, defender, hit }) => {
    if (hit) {
        return; // the "damage" listener below covers the hit case
    }
    if (attacker.socket) {
        writeToSocket(attacker.socket, `You swing at ${nameFor(defender, attacker)} and miss.`);
    }
    if (defender.socket) {
        writeToSocket(defender.socket, `${nameFor(attacker, defender)} swings at you and misses.`);
    }
    broadcastToRoom(
        attacker,
        (viewer) => `${nameFor(attacker, viewer)} swings at ${nameFor(defender, viewer)} and misses.`,
        [attacker, defender],
    );
});

on('damage', ({ attacker, defender, amount }) => {
    if (attacker.socket) {
        writeToSocket(attacker.socket, `You hit ${nameFor(defender, attacker)} for ${amount} damage!`);
    }
    if (defender.socket) {
        writeToSocket(defender.socket, `${nameFor(attacker, defender)} hits you for ${amount} damage!`);
    }
    broadcastToRoom(
        attacker,
        (viewer) => `${nameFor(attacker, viewer)} hits ${nameFor(defender, viewer)} for ${amount} damage!`,
        [attacker, defender],
    );
});

on('defeat', ({ character, defeatedBy }) => {
    if (character.socket) {
        writeToSocket(character.socket, 'You have been defeated!');
    }
    if (defeatedBy.socket) {
        writeToSocket(defeatedBy.socket, `You have defeated ${nameFor(character, defeatedBy)}!`);
    }
    broadcastToRoom(
        character,
        (viewer) => `${nameFor(defeatedBy, viewer)} has defeated ${nameFor(character, viewer)}!`,
        [character, defeatedBy],
    );
});
