// Generic named-stat storage and modification (see ARCHITECTURE.md's
// Phase 2 notes). Core knows the *shape* of a stat - a base value plus a
// stack of tagged modifiers - and how to fold that into an effective
// value. It never knows what any stat is called or means; that's entirely
// theme data (see modules/content/loadStatDefinitions.js).
//
// character.components.stats = {
//   hp: { base: 10, modifiers: [{ tag: "...", operation: "add", amount: -2 }] },
//   ...
// };

function getStat(character, key) {
    return character.components.stats?.[key];
}

function requireStat(character, key) {
    const stat = getStat(character, key);
    if (!stat) {
        throw new Error(`Unknown stat "${key}".`);
    }
    return stat;
}

/**
 * Seed a stat on a character.
 * @param {object} character
 * @param {string} key
 * @param {number} baseValue
 */
export function initStat(character, key, baseValue) {
    character.components.stats ??= {};
    character.components.stats[key] = { base: baseValue, modifiers: [] };
}

/**
 * The effective value of a stat: base, folded through its modifiers in
 * the order they were applied. Operations are intentionally open-ended
 * (only "add" and "multiply" exist today) - a future modifier kind (e.g.
 * a humoral "pull toward a target value") is a new case here, not a
 * rework of how modifiers are stored or stacked.
 * @param {object} character
 * @param {string} key
 * @returns {number|undefined} undefined if the stat doesn't exist.
 */
export function getStatValue(character, key) {
    const stat = getStat(character, key);
    if (!stat) {
        return undefined;
    }

    return stat.modifiers.reduce((value, modifier) => {
        switch (modifier.operation) {
            case "add":
                return value + modifier.amount;
            case "multiply":
                return value * modifier.amount;
            default:
                throw new Error(`Unknown stat modifier operation "${modifier.operation}".`);
        }
    }, stat.base);
}

/**
 * Permanently change a stat's base value (leveling up, a lasting injury).
 * For temporary/reversible changes, use setModifier instead.
 * @param {object} character
 * @param {string} key
 * @param {number} delta
 */
export function adjustBaseStat(character, key, delta) {
    requireStat(character, key).base += delta;
}

/**
 * Apply a tagged, temporary modifier to a stat. Re-applying the same tag
 * replaces the existing modifier rather than stacking a duplicate, so a
 * source (e.g. "pull from eating spoiled meat") can later be found,
 * updated, or removed by that same tag.
 * @param {object} character
 * @param {string} key
 * @param {string} tag
 * @param {string} operation - e.g. "add", "multiply"
 * @param {number} amount
 */
export function setModifier(character, key, tag, operation, amount) {
    const stat = requireStat(character, key);
    const existing = stat.modifiers.find(modifier => modifier.tag === tag);
    if (existing) {
        existing.operation = operation;
        existing.amount = amount;
    } else {
        stat.modifiers.push({ tag, operation, amount });
    }
}

/**
 * Remove a previously-applied tagged modifier, if present. No-ops if the
 * stat or tag doesn't exist.
 * @param {object} character
 * @param {string} key
 * @param {string} tag
 */
export function removeModifier(character, key, tag) {
    const stat = getStat(character, key);
    if (!stat) {
        return;
    }
    stat.modifiers = stat.modifiers.filter(modifier => modifier.tag !== tag);
}
