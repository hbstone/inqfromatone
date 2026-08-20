// Passive vitality regeneration (see ARCHITECTURE.md's Combat section).
// Nothing else heals a character back - a defeated participant just sits
// at 0 `hp` indefinitely otherwise - so this is a flat, unconditional
// trickle: same rate for everyone, in or out of combat, no "resting heals
// faster" or "regen pauses mid-fight" concept yet. Deliberately the
// simplest thing that gives regen a floor to iterate on later.
import { getStatKeyForRole, getStatDefinition } from "../content/loadStatDefinitions.js";
import { getStatValue, adjustBaseStat } from "../stats.js";

const REGEN_INTERVAL_MS = 30 * 1000;
const REGEN_AMOUNT = 1;

/**
 * Start the global regen ticker: every REGEN_INTERVAL_MS, every online
 * character's vitality-role stat heals by REGEN_AMOUNT, capped at that
 * stat's defined starting value. That cap is a v1 stand-in for a real
 * max-vitality concept - there's no separate "current vs. max hp" split
 * anywhere else in the stats system yet (base *is* current), so the
 * content-defined starting value is the closest thing to "full health"
 * available to key off.
 * @param {import("../World.js").World} world
 * @returns {NodeJS.Timeout} The interval handle (e.g. for tests to clear).
 */
export function startRegenTicker(world) {
    return setInterval(() => regenTick(world), REGEN_INTERVAL_MS);
}

function regenTick(world) {
    const key = getStatKeyForRole("vitality");
    if (!key) {
        return;
    }

    const max = getStatDefinition(key).startingValue;
    for (const character of world.getOnlineCharacters()) {
        const current = getStatValue(character, key);
        if (current === undefined || current >= max) {
            continue;
        }
        adjustBaseStat(character, key, Math.min(REGEN_AMOUNT, max - current));
    }
}
