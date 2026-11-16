// Whether the people around someone notice what they're doing (see
// ARCHITECTURE.md's "Noticing"). Core asks; a pack decides.
//
// For each action that others would see (arriving, leaving, picking
// something up, handing it over...), core asks the registered notice rule
// how each observer took it:
//
//   - "noticed": they see the usual message.
//   - "suspicious": they see it, plus that the actor seemed to be trying
//     not to be noticed.
//   - "unnoticed": they see nothing, and an NPC remembers nothing.
//
// Observers who can't see right now (see senses.js) never notice. With no
// rule registered, everyone else always does: a game without a stealth
// pack behaves as if nobody ever tries to be quiet.
//
// The actor's own message never changes: you always think you're being
// sneaky.
import { canSense } from './senses.js';
import { sendTo } from './utils.js';

export const DEFAULT_SUSPICIOUS_NOTE = 'They appear to be trying to avoid notice.';

let rule = null;
let suspiciousNote = DEFAULT_SUSPICIOUS_NOTE;

/**
 * Register the rule deciding who notices what. One per game, like the check
 * resolver: replacing one takes { override: true }.
 * @param {(request: { actor: object, action: string, observers: object[] }) => Map<object, string>|null|undefined} fn -
 *   Called once per action with everyone who could notice it, so one roll
 *   about the actor ("are they sneaking this time?") applies to all of them.
 *   Returns each observer's outcome; anyone missing, or no map at all,
 *   noticed.
 * @param {{ note?: string, override?: boolean }} [options] - note: what a
 *   suspicious observer sees appended.
 */
export function registerNoticeRule(fn, { note, override = false } = {}) {
    if (rule && !override) {
        throw new Error('A notice rule is already registered (pass { override: true } to replace it).');
    }
    rule = fn;
    suspiciousNote = note ?? DEFAULT_SUSPICIOUS_NOTE;
}

/** Remove the notice rule (tests). */
export function clearNoticeRule() {
    rule = null;
    suspiciousNote = DEFAULT_SUSPICIOUS_NOTE;
}

/**
 * How everyone in a room took an action: a Map of observer -> "noticed",
 * "suspicious" or "unnoticed", for everyone but the actor and `exclude`.
 * @param {object} room
 * @param {object} actor
 * @param {string} action - "arrive", "leave", "get", "give", "drop",
 *   "put", "wear", "wield", "remove".
 * @param {object[]} [exclude]
 * @returns {Map<object, string>}
 */
export function noticesIn(room, actor, action, exclude = []) {
    const present = room.others(actor).filter((c) => !exclude.includes(c));
    const observers = present.filter((c) => canSense(c, 'sight'));
    const decided = (rule && observers.length > 0 && rule({ actor, action, observers })) || new Map();
    return new Map(present.map((c) => [c, observers.includes(c) ? (decided.get(c) ?? 'noticed') : 'unnoticed']));
}

/**
 * Tell each observer who noticed, from their own view (see naming.js's
 * tellRoom): `render(viewer)` builds the message, with the suspicious note
 * appended for those who caught the actor trying not to be seen.
 * @param {Map<object, string>} notices - From noticesIn.
 * @param {(viewer: object) => string} render
 */
export function tellNoticed(notices, render) {
    for (const [viewer, outcome] of notices) {
        if (outcome !== 'unnoticed') {
            const line = render(viewer);
            sendTo(viewer, outcome === 'suspicious' ? `${line} ${suspiciousNote}` : line);
        }
    }
}

/**
 * noticesIn, then tellNoticed: the usual way to tell a room about something
 * someone did that they might want to keep quiet.
 * @returns {Map<object, string>} The notices, for anything else that cares.
 */
export function tellRoomNoticing(room, actor, action, render, exclude = []) {
    const notices = noticesIn(room, actor, action, exclude);
    tellNoticed(notices, render);
    return notices;
}
