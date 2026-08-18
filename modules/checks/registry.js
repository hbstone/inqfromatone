// Engine-side check resolution (see ARCHITECTURE.md / ROADMAP.md).
//
// "The process of rolling vs an ability" is core; the actual formula
// (d20 vs DC, roll-under percentile, dice pools, whatever) is entirely
// theme-owned. Core just computes the effective stat value and hands it,
// plus whatever opaque context the caller passed, to a single registered
// resolver function.
//
// Unlike the command registry (many verbs, one handler each), there's
// only ever one "how do checks resolve" answer for a running server -
// registering again replaces the previous resolver rather than erroring.
import { getStatValue } from "../stats.js";

let resolver = null;

/**
 * Register the function that resolves checks. Replaces any previously
 * registered resolver.
 * @param {(payload: { character: object, statKey: string, value: number, context: object }) => any} fn
 */
export function registerCheckResolver(fn) {
    resolver = fn;
}

/**
 * Resolve a check against a character's stat. Core computes the stat's
 * current effective value; everything about what "resolving" means
 * (dice, thresholds, degrees of success) is up to the registered resolver.
 * @param {object} character
 * @param {string} statKey
 * @param {object} [context] - Opaque, resolver-defined (e.g. { difficulty: 15 }).
 * @returns {any} Whatever the registered resolver returns.
 */
export function resolveCheck(character, statKey, context = {}) {
    if (!resolver) {
        throw new Error("No check resolver registered (see registerCheckResolver).");
    }

    const value = getStatValue(character, statKey);
    return resolver({ character, statKey, value, context });
}
