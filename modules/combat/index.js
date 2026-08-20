// The current combat content pack (see ARCHITECTURE.md's Combat section) -
// same framing as modules/checks/index.js and modules/commands/index.js:
// a real, working default so the plumbing (registry, session engine,
// events) is proven against something, not left theoretical. Moves under
// a real content pack once Phase 4 builds one.
//
// Ships the one attack anyone can throw right now - an unarmed strike -
// plus the player-facing messages for what an auto-attack did. No
// wielded-weapon concept yet (see ARCHITECTURE.md's open question on
// that). Requires setWorld() (called once from game.js) to reach room
// bystanders - the two combatants get their direct messages regardless.
import { registerAttackProducer } from "./registry.js";
import { getStatKeyForRole } from "../content/loadStatDefinitions.js";
import { getStatValue } from "../stats.js";
import { on } from "../events.js";
import { writeToSocket } from "../utils.js";

const UNARMED_DAMAGE = 1;

registerAttackProducer((attacker, defender) => ({
    statKey: getStatKeyForRole("offense"),
    context: { difficulty: getStatValue(defender, getStatKeyForRole("defense")) },
    damage: UNARMED_DAMAGE,
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
function broadcastToRoom(character, message, exclude) {
    const room = world?.getRoomById(character.roomId);
    if (!room) {
        return;
    }
    for (const bystander of room.characters) {
        if (!exclude.includes(bystander) && bystander.socket) {
            writeToSocket(bystander.socket, message);
        }
    }
}

on("attack", ({ attacker, defender, hit }) => {
    if (hit) {
        return; // the "damage" listener below covers the hit case
    }
    if (attacker.socket) {
        writeToSocket(attacker.socket, `You swing at ${defender.name} and miss.`);
    }
    if (defender.socket) {
        writeToSocket(defender.socket, `${attacker.name} swings at you and misses.`);
    }
    broadcastToRoom(attacker, `${attacker.name} swings at ${defender.name} and misses.`, [attacker, defender]);
});

on("damage", ({ attacker, defender, amount }) => {
    if (attacker.socket) {
        writeToSocket(attacker.socket, `You hit ${defender.name} for ${amount} damage!`);
    }
    if (defender.socket) {
        writeToSocket(defender.socket, `${attacker.name} hits you for ${amount} damage!`);
    }
    broadcastToRoom(attacker, `${attacker.name} hits ${defender.name} for ${amount} damage!`, [attacker, defender]);
});

on("defeat", ({ character, defeatedBy }) => {
    if (character.socket) {
        writeToSocket(character.socket, "You have been defeated!");
    }
    if (defeatedBy.socket) {
        writeToSocket(defeatedBy.socket, `You have defeated ${character.name}!`);
    }
    broadcastToRoom(character, `${defeatedBy.name} has defeated ${character.name}!`, [character, defeatedBy]);
});
