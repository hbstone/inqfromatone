// Color code support for player-facing text: a small markup embedded
// directly in strings (room descriptions, command output, chat, and -
// eventually - player-chosen item/character names), translated to real
// ANSI at the writeToSocket boundary (see utils.js). Nothing upstream of
// that boundary needs to know whether a given player has color on or off.
//
// Two token forms, both introduced by a bare "{" - no closing brace
// required (a trailing "}" is tolerated and consumed if present, so
// either "{500 text" or "{500} text" works - see TOKEN_RE):
//
//   {rgb   - one digit 0-5 per channel, the xterm 256-color 6x6x6 cube
//            (index = 16 + 36r + 6g + b). Full precision, e.g. {500 red,
//            {050 green, {005 blue, {555 white, {000 black.
//   {c     - a single letter alias for a specific point in that same
//            cube, for players who don't want to think in cube
//            coordinates: R/r G/g Y/y B/b M/m C/c W/w (case = bright vs
//            dark/regular), K/k both resolve to the same dark grey
//            (rather than a true black, which would vanish on a black
//            terminal background), plus U/u (underline) and X/x (reset).
//            Deliberately no separate "bold" letter - brightness is
//            already carried by case, per COLOR_ALIASES below.
//
// A "{" not followed by a recognized 3-digit or 1-letter payload is left
// alone as literal text, not consumed or eaten - so stray "{" characters
// in ordinary content never disappear or throw.

const RESET = "\x1b[0m";

// Letter aliases, each resolving to an [r, g, b] point (0-5 each) in the
// same cube the {rgb form addresses directly. Tunable in one place
// without touching the parser below.
const COLOR_ALIASES = {
    R: [5, 0, 0], r: [3, 0, 0],
    G: [0, 5, 0], g: [0, 2, 0],
    Y: [5, 5, 0], y: [3, 3, 0],
    B: [0, 0, 5], b: [0, 0, 2],
    M: [5, 0, 5], m: [3, 0, 3],
    C: [0, 5, 5], c: [0, 3, 3],
    K: [2, 2, 2], k: [2, 2, 2], // both "blacK" - a dark grey, not true black
    W: [5, 5, 5], w: [3, 3, 3],
};

const STYLE_ALIASES = {
    U: "\x1b[4m", u: "\x1b[4m", // underline
    X: RESET, x: RESET, // reset
};

const LETTER_CLASS = Object.keys({ ...COLOR_ALIASES, ...STYLE_ALIASES }).join("");

// A single token, matched anywhere: group 1 an {rgb} cube code, group 2 a
// single-letter alias. The optional trailing "}" is consumed either way
// but never required.
const TOKEN_BODY = `\\{(?:([0-5]{3})|([${LETTER_CLASS}]))\\}?`;
const TOKEN_RE = new RegExp(TOKEN_BODY, "g");

// Zero or more tokens anchored at the start of a string, with no capture
// groups of their own - just used to measure how much leading "token
// noise" to skip past (see capitalizeFirst).
const LEADING_TOKENS_RE = new RegExp(`^(?:${TOKEN_BODY})*`);

function cubeToAnsi([r, g, b]) {
    return `\x1b[38;5;${16 + 36 * r + 6 * g + b}m`;
}

function tokenToAnsi(cubeDigits, letter) {
    if (cubeDigits) {
        return cubeToAnsi(cubeDigits.split("").map(Number));
    }
    if (letter in STYLE_ALIASES) {
        return STYLE_ALIASES[letter];
    }
    return cubeToAnsi(COLOR_ALIASES[letter]);
}

/**
 * Replace every color/style token in a string with real ANSI escape
 * codes, appending a trailing reset - but only when the string actually
 * used a token, so plain text passes through untouched (no wasted bytes
 * on a no-op reset).
 * @param {string} str
 * @returns {string}
 */
export function renderColors(str) {
    let usedColor = false;
    const rendered = str.replace(TOKEN_RE, (_match, cubeDigits, letter) => {
        usedColor = true;
        return tokenToAnsi(cubeDigits, letter);
    });
    return usedColor ? rendered + RESET : rendered;
}

/**
 * Strip every color/style token out of a string, leaving plain text -
 * for contexts that don't render color but also shouldn't choke on it
 * (e.g. a character name typed with color codes in it, see game.js).
 * Never throws; a string with no tokens is returned unchanged.
 * @param {string} str
 * @returns {string}
 */
export function stripColors(str) {
    return str.replace(TOKEN_RE, "");
}

/**
 * Uppercase the first real character of a string, skipping past any
 * leading color/style tokens - so writeToSocket's "capitalize the first
 * letter" behavior still lands on the first letter, not a token.
 * @param {string} str
 * @returns {string}
 */
export function capitalizeFirst(str) {
    const [leading] = LEADING_TOKENS_RE.exec(str);
    const rest = str.slice(leading.length);
    return leading + rest.charAt(0).toUpperCase() + rest.slice(1);
}
