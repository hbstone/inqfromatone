// What a character can perceive right now (see ARCHITECTURE.md's "Senses").
// Each sense is named and on unless something switches it off:
//
//   - the character's own `senses`: an NPC's content ("senses": { "sight":
//     false } for a blind beggar); a player's, once something sets them.
//   - layers: what's going on with them now, each registered with
//     registerSenseLayer. An NPC's routine post is one (see
//     modules/npcs/routine.js): "senses": { "sight": false, "hearing":
//     false } while it sleeps in the storeroom. A player sleeping would be
//     another.
//
// A layer overrides per sense, so a blind NPC that sleeps stays blind. What
// needs which sense is up to whatever uses it: NPC sightings need sight,
// hearsay needs hearing. Smell has nothing using it yet, but it's a known
// sense so content can already say a sleeper still smells smoke (or
// perfume).
//
// Nothing checks a player's senses yet: messages reach everyone in the room
// regardless. A player sleeping (and "dim" senses, like hearing scraps of
// talk in your sleep) needs messages to say which sense they reach.

export const SENSES = ['sight', 'hearing', 'smell'];

const layers = [];

/**
 * Add a layer of senses switched on or off by what's going on with a
 * character now. Layers registered earlier win where two disagree.
 * @param {(character: object, hour?: number) => object|null|undefined} layer -
 *   The senses it decides now, like { "hearing": false }, or nothing.
 */
export function registerSenseLayer(layer) {
    layers.push(layer);
}

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
 * Whether a character can use a sense now: the first layer that says so,
 * else their own senses, else yes.
 * @param {object} character
 * @param {string} sense - One of SENSES.
 * @param {number} [hour] - Game hour, overridable for tests; passed to layers.
 */
export function canSense(character, sense, hour) {
    for (const layer of layers) {
        const value = layer(character, hour)?.[sense];
        if (value !== undefined) {
            return value;
        }
    }
    return character.senses?.[sense] ?? true;
}
