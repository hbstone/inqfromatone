// How one character appears to another (see ARCHITECTURE.md's "Naming").
//
// Every in-character message that names someone to someone else goes
// through nameFor(subject, viewer), and every command that targets a
// character by keyword goes through findCharacter(viewer, ...). By default
// both just use real names. A naming policy (setNamingPolicy) can change
// that in one place: recognition will install one where a stranger shows
// as their short description, someone you've remembered shows as the name
// you gave them, and targeting matches what *you* see - never a real name
// you haven't learned. Not installing it is how a game goes without.
//
// Out-of-character text keeps real names on purpose and doesn't use these:
// `who`, `tell`, login, and the "has left the game" / "has disconnected"
// notices.
import { keywordMatches } from "./keywordMatch.js";
import { writeToSocket } from "./utils.js";

const REAL_NAMES = {
    nameFor: (subject) => subject.name,
    keywordsFor: (subject) => subject.keywords,
};

let policy = REAL_NAMES;

/**
 * Replace how characters are named and matched per viewer. Either function
 * may be left out to keep the real-name default for it.
 * @param {{ nameFor?: (subject: object, viewer: object|null) => string,
 *   keywordsFor?: (subject: object, viewer: object|null) => string[] }} newPolicy
 */
export function setNamingPolicy(newPolicy) {
    policy = { ...REAL_NAMES, ...newPolicy };
}

/** Back to real names for everyone (tests, or a game without recognition). */
export function resetNamingPolicy() {
    policy = REAL_NAMES;
}

/**
 * What `viewer` calls `subject`. You always see your own real name.
 * @param {object} subject - The character being named.
 * @param {object|null} viewer - Who's reading; null for no one in
 *   particular.
 * @returns {string}
 */
export function nameFor(subject, viewer) {
    return subject === viewer ? subject.name : policy.nameFor(subject, viewer);
}

/**
 * The keywords `viewer` can use to refer to `subject`.
 * @param {object} subject
 * @param {object|null} viewer
 * @returns {string[]}
 */
export function keywordsFor(subject, viewer) {
    return subject === viewer ? subject.keywords : policy.keywordsFor(subject, viewer);
}

/**
 * The first of `candidates` that `viewer` could mean by `token` (fuzzy,
 * see keywordMatch.js).
 * @param {object} viewer
 * @param {object[]} candidates - Usually room.characters, maybe filtered.
 * @param {string} token
 * @returns {object|null}
 */
export function findCharacter(viewer, candidates, token) {
    return candidates.find(c => keywordMatches(keywordsFor(c, viewer), token)) ?? null;
}

/**
 * Send each connected character in a room their own version of a message,
 * so names in it can differ per viewer.
 * @param {import("./Room.js").Room} room
 * @param {(viewer: object) => string} render - Builds the message for one
 *   viewer, typically with nameFor(someone, viewer).
 * @param {object[]} [exclude] - Characters who get nothing (usually the
 *   actor, who gets their own "You ..." line instead).
 */
export function tellRoom(room, render, exclude = []) {
    for (const viewer of room.characters) {
        if (viewer.socket && !exclude.includes(viewer)) {
            writeToSocket(viewer.socket, render(viewer));
        }
    }
}
