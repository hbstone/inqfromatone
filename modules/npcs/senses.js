// What an NPC can perceive right now (see ARCHITECTURE.md's "Senses").
// Each sense is named and on unless switched off, by the NPC's content or
// by the routine post it's at, one sense at a time:
//
//   "senses": { "sight": false }                       // a blind beggar
//   routine: [{ "from": "night", "at": "storeroom",
//               "senses": { "sight": false, "hearing": false } }]  // asleep
//
// A post's senses override the NPC's per sense, so a blind NPC that sleeps
// stays blind. What needs which sense is up to whatever uses it: sightings
// need sight, hearsay needs hearing. Smell has nothing using it yet, but
// it's a known sense so content can already say a sleeper still smells
// smoke (or perfume).
import { getGameTime } from '../gameClock.js';
import { currentRoutineEntry } from './routine.js';

export const SENSES = ['sight', 'hearing', 'smell'];

/**
 * Check a "senses" object written in content, so a typo ("smel") fails at
 * startup rather than silently leaving a sense on.
 * @param {unknown} senses
 * @param {string} where - For the error message.
 */
export function validateSenses(senses, where) {
    if (senses === undefined) {
        return;
    }
    if (!senses || typeof senses !== 'object' || Array.isArray(senses)) {
        throw new Error(`${where}: "senses" must be an object like { "sight": false }.`);
    }
    for (const [sense, value] of Object.entries(senses)) {
        if (!SENSES.includes(sense)) {
            throw new Error(`${where}: unknown sense "${sense}" (known: ${SENSES.join(', ')}).`);
        }
        if (typeof value !== 'boolean') {
            throw new Error(`${where}: sense "${sense}" must be true or false.`);
        }
    }
}

/**
 * Whether an NPC can use a sense now: the post it's at decides if it says
 * so, else the NPC's own content, else yes. Anyone who isn't an NPC can.
 * @param {object} character
 * @param {string} sense - One of SENSES.
 * @param {number} [hour] - Overridable for tests.
 */
export function canSense(character, sense, hour) {
    if (!character.isNpc) {
        return true;
    }
    const entry = character.routine && currentRoutineEntry(character.routine, hour ?? getGameTime().hour);
    const atPost = entry && character.roomId === entry.roomId;
    return (atPost ? entry.senses?.[sense] : undefined) ?? character.senses?.[sense] ?? true;
}
