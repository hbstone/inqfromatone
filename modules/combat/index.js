// The current combat content pack (see ARCHITECTURE.md's Combat section) -
// same framing as modules/checks/index.js and modules/commands/index.js:
// a real, working default so the plumbing (registry, session engine,
// events) is proven against something, not left theoretical. Moves under
// a real content pack once Phase 4 builds one.
//
// Ships the one attack anyone can throw right now - an unarmed strike -
// plus the player-facing messages for what an auto-attack did. No
// wielded-weapon concept yet (see ARCHITECTURE.md's open question on
// that). v1 messages only reach the two combatants directly, not room
// bystanders - broadcasting to the room would mean threading `world`
// through the combat engine just for flavor text, not worth it yet.
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
});

on("damage", ({ attacker, defender, amount }) => {
    if (attacker.socket) {
        writeToSocket(attacker.socket, `You hit ${defender.name} for ${amount} damage!`);
    }
    if (defender.socket) {
        writeToSocket(defender.socket, `${attacker.name} hits you for ${amount} damage!`);
    }
});

on("defeat", ({ character, defeatedBy }) => {
    if (character.socket) {
        writeToSocket(character.socket, "You have been defeated!");
    }
    if (defeatedBy.socket) {
        writeToSocket(defeatedBy.socket, `You have defeated ${character.name}!`);
    }
});
