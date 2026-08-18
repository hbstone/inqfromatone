// Core combat session engine (see ARCHITECTURE.md's Combat section).
// Tracks who's fighting whom and drives each participant's auto-attack
// timer. Has no opinion about what an attack looks like (that's
// registry.js's job) or what a defeat/hit/miss should say to a player
// (that's modules/combat/index.js, listening for the events emitted
// below) - this file only knows the mechanics: sessions, participants,
// timers, and the one role (vitality) it needs to know someone's still
// standing.
//
// v1 note: this is a simplified stand-in for the round/pendingActions
// engine documented in ARCHITECTURE.md. With every action auto-generated
// (no cemote yet), there's nothing to collect or wait on, so each
// participant just gets an independent repeating timer instead of a
// batched round. The full round engine is still the plan once cemote
// needs multiple sides to submit before anything resolves.
import { randomUUID } from "crypto";
import { getStatKeyForRole } from "../content/loadStatDefinitions.js";
import { getStatValue } from "../stats.js";
import { produceAttack } from "./registry.js";
import { resolveAttack } from "./resolveAttack.js";
import { emit } from "../events.js";

const AUTO_ATTACK_INTERVAL_MS = 2000;
// A safety net against a stuck session, not a real combat timer - should
// essentially never fire while everyone's on auto-attack.
const SESSION_SAFETY_TIMEOUT_MS = 5 * 60 * 1000;

const sessions = new Map(); // id -> session

function isAlive(character) {
    return getStatValue(character, getStatKeyForRole("vitality")) > 0;
}

function createSession() {
    const session = { id: randomUUID(), participants: new Map() };
    session.safetyTimer = setTimeout(() => {
        console.error(`Combat session ${session.id} hit its safety timeout - force-ending.`);
        endSession(session);
    }, SESSION_SAFETY_TIMEOUT_MS);
    sessions.set(session.id, session);
    return session;
}

/**
 * @param {object} character
 * @returns {object|undefined} The character's active session, if any.
 */
export function getSession(character) {
    const sessionId = character.components.combat?.sessionId;
    return sessionId ? sessions.get(sessionId) : undefined;
}

function removeParticipant(session, character) {
    const entry = session.participants.get(character);
    if (!entry) {
        return;
    }
    clearInterval(entry.timer);
    session.participants.delete(character);
    delete character.components.combat;
}

function addParticipant(session, character, target) {
    character.components.combat = { sessionId: session.id };
    const entry = { target, timer: null };
    session.participants.set(character, entry);
    entry.timer = setInterval(() => performAutoAttack(session, character), AUTO_ATTACK_INTERVAL_MS);
}

function performAutoAttack(session, character) {
    const entry = session.participants.get(character);
    if (!entry) {
        return; // removed between ticks (disengaged, session ended)
    }

    const target = entry.target;
    if (!isAlive(character) || !isAlive(target)) {
        // No re-targeting yet if your target's already down (see the m:n
        // note in ARCHITECTURE.md) - just sit out until the session-end
        // check below catches up.
        return;
    }

    resolveAttack(character, target, produceAttack(character, target));

    if (!isAlive(target)) {
        removeParticipant(session, target);
        emit("defeat", { character: target, defeatedBy: character });
    }

    checkForSessionEnd(session);
}

function checkForSessionEnd(session) {
    const living = Array.from(session.participants.keys()).filter(isAlive);
    if (living.length >= 2) {
        return;
    }
    endSession(session);
}

function endSession(session) {
    clearTimeout(session.safetyTimer);
    const participants = Array.from(session.participants.keys());
    for (const character of participants) {
        removeParticipant(session, character);
    }
    sessions.delete(session.id);
    emit("combatEnd", { participants });
}

/**
 * Start or join a combat session against a target - the mechanics behind
 * the `kill` command. If either side is already in a session, the other
 * joins it rather than starting a separate one; if the attacker was
 * already fighting someone else, they leave that fight first (one fight
 * at a time, for now).
 * @param {object} attacker
 * @param {object} target
 * @returns {boolean} Whether combat was actually joined (false if the
 *   target's already down, or attacker === target).
 */
export function engageCombat(attacker, target) {
    if (attacker === target || !isAlive(target)) {
        return false;
    }

    const targetSession = getSession(target);
    const attackerSession = getSession(attacker);
    if (attackerSession && attackerSession !== targetSession) {
        disengageCombat(attacker);
    }

    const session = targetSession ?? getSession(attacker) ?? createSession();

    if (session.participants.has(attacker)) {
        session.participants.get(attacker).target = target;
    } else {
        addParticipant(session, attacker, target);
    }

    if (!session.participants.has(target)) {
        addParticipant(session, target, attacker);
    }

    return true;
}

/**
 * Remove one participant from their active session, if any. Combat
 * continues for whoever's left, once there's more than one (see the m:n
 * note in ARCHITECTURE.md - v1 is mostly exercised 1:1, where this just
 * ends the fight for both sides).
 * @param {object} character
 * @returns {boolean} Whether they were actually in a session.
 */
export function disengageCombat(character) {
    const session = getSession(character);
    if (!session) {
        return false;
    }

    removeParticipant(session, character);
    checkForSessionEnd(session);
    return true;
}
