// Named conditions that content can put in a "when" (see ARCHITECTURE.md's
// "Conditions"). A "when" is an object of condition name -> value, and holds
// when every condition in it does:
//
//   { "keywords": ["whiskey"], "when": { "phase": "night" }, "says": "..." }
//   { "when": { "phase": ["dusk", "night"] } }
//
// Core registers `phase`. Packs add their own with pack.registerCondition
// (quest state, the asker's reputation, the weather), before content loads,
// so an unknown name or a bad value fails at startup with where it was.
import { getGameTime } from './gameClock.js';

// A function, not a top-level const: this module is in the import cycle
// through gameClock.js (see CLAUDE.md's "Known traps"), and modules in that
// loop (modules/npcs/relationships.js) register their conditions while it
// loads, before a const here would exist. Function declarations are ready
// from the start.
function registry() {
    registry.map ??= new Map();
    return registry.map;
}

/**
 * @param {string} name - What content writes in a "when".
 * @param {{ test: (value: any, context: object) => boolean, validate?: (value: any) => string|null }} condition -
 *   `test` decides; `validate` returns what's wrong with a value as written
 *   in content, or null.
 * @param {{ override?: boolean }} [options]
 */
export function registerCondition(name, { test, validate }, { override = false } = {}) {
    if (typeof test !== 'function') {
        throw new Error(`Condition "${name}" needs a test function.`);
    }
    if (registry().has(name) && !override) {
        throw new Error(`Condition "${name}" is already registered (pass { override: true } to replace it).`);
    }
    registry().set(name, { test, validate });
}

/**
 * Check a "when" as written in content.
 * @param {unknown} when
 * @param {string} where - For the error message.
 */
export function validateWhen(when, where) {
    if (when === undefined) {
        return;
    }
    if (!when || typeof when !== 'object' || Array.isArray(when)) {
        throw new Error(`${where}: "when" must be an object like { "phase": "night" }.`);
    }
    for (const [name, value] of Object.entries(when)) {
        const condition = registry().get(name);
        if (!condition) {
            throw new Error(`${where}: unknown condition "${name}" (known: ${[...registry().keys()].join(', ')}).`);
        }
        const problem = condition.validate?.(value);
        if (problem) {
            throw new Error(`${where}: condition "${name}" ${problem}`);
        }
    }
}

/**
 * Whether a "when" holds. A missing "when" always holds.
 * @param {object} [when]
 * @param {object} [context] - Whatever the caller knows: { npc, asker,
 *   room, time }. `time` defaults to the game clock's.
 */
export function whenHolds(when, context = {}) {
    if (!when) {
        return true;
    }
    const full = { ...context, time: context.time ?? getGameTime() };
    return Object.entries(when).every(([name, value]) => registry().get(name)?.test(value, full) ?? false);
}

// { "phase": "night" } or { "phase": ["dusk", "night"] }
registerCondition('phase', {
    test: (value, { time }) => [value].flat().includes(time.phase),
    validate: (value) => {
        const phases = [value].flat();
        return phases.length > 0 && phases.every((p) => typeof p === 'string' && p)
            ? null
            : 'must be a phase name or a list of them.';
    },
});
