// Presence lines (see ARCHITECTURE.md's "Presence"): what someone is doing,
// shown as their own line when others `look` or walk in -
// "A bearded man sweeps the cobblestone with a worn broom." Everyone else
// shows as "<name> is here."
//
// Players set theirs with `presence`; it clears when they leave the room or
// quit, since what you were doing doesn't follow you. Later, commands may
// set or clear it themselves (say, a forge loop showing "is working at the
// forge."). NPCs get theirs from content: a template's `presence`, or the
// current routine post's while they're at it.
import { nameFor } from "./naming.js";
import { capitalizeFirst } from "./color.js";
import { getGameTime } from "./gameClock.js";
import { currentRoutineEntry } from "./npcs/routine.js";

export const PRESENCE_MAX = 120;
const DEFAULT_PRESENCE = "is here.";

/**
 * What a character is currently doing, or null for nothing in particular.
 * @param {object} character
 * @param {number} [hour] - The game hour, for NPC routines; overridable
 *   for tests.
 * @returns {string|null}
 */
export function presenceOf(character, hour = getGameTime().hour) {
    if (!character.isNpc) {
        return character.presence ?? null;
    }
    const entry = character.routine && currentRoutineEntry(character.routine, hour);
    if (!entry) {
        return character.basePresence ?? null;
    }
    if (character.roomId !== entry.roomId) {
        return null; // on the way to their post: no "raking leaves" in the hallway
    }
    return entry.presence ?? character.basePresence ?? null;
}

/**
 * One character's line, as `viewer` sees it, capitalized to start a line.
 * @param {object} subject
 * @param {object} viewer
 * @param {number} [hour]
 * @returns {string}
 */
export function presenceLine(subject, viewer, hour) {
    return capitalizeFirst(`${nameFor(subject, viewer)} ${presenceOf(subject, hour) ?? DEFAULT_PRESENCE}`);
}

/**
 * Tidy presence text someone typed: one line, first letter lowercased (it
 * follows a name), and a period added if it ends in a letter or number -
 * the same rule as emote.
 * @param {string} input
 * @returns {{ value: string }|{ error: string }}
 */
export function normalizePresence(input) {
    let text = (input ?? "").trim().replace(/\s+/g, " ");
    if (!text) {
        return { error: "Usage: presence <what you're doing>, e.g. presence sweeps the floor" };
    }
    if (text.length > PRESENCE_MAX) {
        return { error: `That's too long for a presence (${PRESENCE_MAX} characters at most).` };
    }
    if (/^[A-Z][a-z]/.test(text)) {
        text = text.charAt(0).toLowerCase() + text.slice(1);
    }
    if (/[a-z0-9]$/i.test(text)) {
        text += ".";
    }
    return { value: text };
}

// `presence` - show yours; `presence <text>` - set it; `presence clear`.
export const presence = (world, args, character) => {
    const text = args.join(" ");
    if (!text) {
        return character.presence
            ? `Your presence: "${character.presence}" It clears when you leave or quit, or with: presence clear`
            : "You have no presence set, so others see that you're here. Set one with: presence <what you're doing>";
    }
    if (text.toLowerCase() === "clear") {
        character.presence = null;
        return "You clear your presence.";
    }
    const result = normalizePresence(text);
    if (result.error) {
        return result.error;
    }
    character.presence = result.value;
    return `Your presence is now: "${result.value}"`;
};
