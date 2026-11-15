// Engine-side check resolution (see ARCHITECTURE.md / ROADMAP.md).
//
// "The process of rolling vs an ability" is core; the actual formula
// (d20 vs DC, roll-under percentile, dice pools, whatever) is entirely
// theme-owned. Core just computes the effective stat value and hands it,
// plus whatever opaque context the caller passed, to a single registered
// resolver function.
//
// There's only ever one "how do checks resolve" answer for a running
// server. Replacing it follows the command registry's rule: say
// `{ override: true }`, so two rules packs can't silently fight over it.
// Core registers a default (see index.js), so a pack bringing its own
// rules always overrides.
import { getStatValue } from '../stats.js';

let resolver = null;

/**
 * Register the function that resolves checks.
 * @param {(payload: { character: object, statKey: string, value: number, context: object }) => any} fn
 * @param {{ override?: boolean }} [options] - Required to replace an
 *   already registered resolver; an error when there's none to replace.
 */
export function registerCheckResolver(fn, { override = false } = {}) {
    if (resolver && !override) {
        throw new Error('A check resolver is already registered (pass { override: true } to replace it).');
    }
    if (!resolver && override) {
        throw new Error('Check resolver registered with { override: true }, but nothing registered one yet.');
    }
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
        throw new Error('No check resolver registered (see registerCheckResolver).');
    }

    const value = getStatValue(character, statKey);
    return resolver({ character, statKey, value, context });
}
