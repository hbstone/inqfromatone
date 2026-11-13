// Recognition (see ARCHITECTURE.md's "Recognition"): strangers see each
// other by short description ("a bearded man"); `remember` gives someone a
// name of your own choosing, which is what you see and can target them by
// from then on, along with private notes about them.
//
// It's a naming policy (modules/naming.js) plus a few commands, switched on
// by a pack's features.json. Without it, everyone sees real names.
//
// Memories are keyed by identity (the lowercased real name), not by short
// description: someone who changes how they look is still recognized. The
// short description they had when you named them is kept as `knewAs`, so
// `remember <them>` can point out the change.
//
// NPCs aren't part of this yet: their content `name` already reads like a
// short description, and remembering them needs its own design.
import { setNamingPolicy, resetNamingPolicy } from '../naming.js';
import { stripColors } from '../color.js';
import { registerCommand } from '../commands/registry.js';
import { remember, forget, rename, shortdesc } from './commands.js';

const ARTICLES = new Set(['a', 'an', 'the']);

// Shown for a player who somehow has no short description yet (login asks
// for one, so this is a fallback, not the norm).
const NO_SHORT_DESC = 'someone';

let enabled = false;
let commandsRegistered = false;

// Where `remember` reads an offline character's save from to show how they
// look now. Overridable for tests.
export const recognitionSettings = { charactersDir: undefined };

/**
 * The key a character's memories are filed under: their real name,
 * lowercased (the same identity their save file uses).
 * @param {object} character
 * @returns {string}
 */
export function identityOf(character) {
    return character.name.toLowerCase();
}

/**
 * Words usable as keywords from a phrase: lowercase, articles dropped.
 * @param {string} phrase
 * @returns {string[]}
 */
export function wordsOf(phrase) {
    return phrase
        .toLowerCase()
        .split(/\s+/)
        .filter((word) => word && !ARTICLES.has(word));
}

/**
 * The memory `viewer` holds about `subject`, if any.
 * @returns {{ name: string, knewAs: string|null, notes: object[] }|null}
 */
export function memoryOf(viewer, subject) {
    return viewer?.memories?.[identityOf(subject)] ?? null;
}

function nameFor(subject, viewer) {
    if (subject.isNpc) {
        return subject.name;
    }
    return memoryOf(viewer, subject)?.name ?? subject.shortDesc ?? NO_SHORT_DESC;
}

function keywordsFor(subject, viewer) {
    if (subject.isNpc) {
        return subject.keywords;
    }
    const remembered = memoryOf(viewer, subject)?.name;
    return [...wordsOf(subject.shortDesc ?? ''), ...(remembered ? wordsOf(remembered) : [])];
}

/**
 * Switch recognition on: install the naming policy and register its
 * commands. Safe to call more than once.
 * @param {{ charactersDir?: string }} [options] - For tests.
 */
export function enableRecognition({ charactersDir } = {}) {
    recognitionSettings.charactersDir = charactersDir;
    setNamingPolicy({ nameFor, keywordsFor });
    enabled = true;
    if (!commandsRegistered) {
        registerCommand('remember', remember);
        registerCommand('forget', forget, { abbreviate: false }); // deleting a history shouldn't be a typo away
        registerCommand('rename', rename);
        registerCommand('shortdesc', shortdesc);
        commandsRegistered = true;
    }
}

/** Switch recognition off again (tests). Its commands stay registered. */
export function disableRecognition() {
    resetNamingPolicy();
    enabled = false;
}

/** @returns {boolean} */
export function isRecognitionEnabled() {
    return enabled;
}

const SHORT_DESC_PATTERN = /^[A-Za-z][A-Za-z ,'-]*$/;
export const SHORT_DESC_MAX = 50;

/**
 * Check and tidy a short description someone typed.
 * @param {string} input
 * @param {string} realName - The character's own name, which mustn't
 *   appear in it (that would give recognition away).
 * @returns {{ value: string }|{ error: string }}
 */
export function validateShortDesc(input, realName) {
    const text = stripColors(input ?? '')
        .trim()
        .replace(/\s+/g, ' ');
    if (text.length < 3 || text.length > SHORT_DESC_MAX) {
        return { error: `A short description should be 3-${SHORT_DESC_MAX} characters, like "a bearded man".` };
    }
    if (!SHORT_DESC_PATTERN.test(text)) {
        return { error: "A short description may only use letters, spaces, and , ' -" };
    }
    const nameWords = new Set(wordsOf(realName));
    if (wordsOf(text).some((word) => nameWords.has(word))) {
        return {
            error: "Your short description can't include your name - it's how people see you before they know it.",
        };
    }
    // It's used mid-sentence ("You look at a bearded man"), so a leading
    // article is lowercased; line starts get capitalized on the way out.
    const [first, ...rest] = text.split(' ');
    const value = ARTICLES.has(first.toLowerCase()) ? [first.toLowerCase(), ...rest].join(' ') : text;
    return { value };
}
