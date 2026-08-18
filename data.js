// Character persistence — one JSON file per character under characters/,
// instead of a single shared characters.json (see ARCHITECTURE.md). Each
// save only touches the one character that changed, rather than
// rewriting every saved character. This module is deliberately a small
// storage adapter: callers deal in plain state objects keyed by name, not
// filesystem details, so swapping the backend for a real embedded DB later
// shouldn't need to touch call sites.
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const DEFAULT_CHARACTERS_DIR = path.join(
    path.dirname(fileURLToPath(import.meta.url)),
    "characters"
);

// Filenames are the lowercased character name directly. This is only safe
// because every name reaching this module has already passed game.js's
// letters-and-spaces-only allowlist — no path-traversal characters are
// possible by the time a name gets here. Lowercasing also closes a
// case-collision bug that per-file storage would otherwise introduce on
// case-insensitive filesystems (Windows, default macOS): "Bob" and "bob"
// would silently share one file.
function slugify(name) {
    return name.toLowerCase();
}

function filePathFor(name, dir) {
    return path.join(dir, `${slugify(name)}.json`);
}

/**
 * Case-insensitive check for whether a character with this name exists.
 * @param {string} name
 * @param {string} [dir] - Characters directory. Defaults to the repo's
 *   top-level characters/ directory; overridable so tests can point at a
 *   fixture directory instead of touching real save data.
 * @returns {boolean}
 */
export function characterExists(name, dir = DEFAULT_CHARACTERS_DIR) {
    return fs.existsSync(filePathFor(name, dir));
}

/**
 * Load a character's saved state.
 * @param {string} name
 * @param {string} [dir]
 * @returns {object|null} The saved record, or null if none exists.
 */
export function loadCharacterState(name, dir = DEFAULT_CHARACTERS_DIR) {
    try {
        const raw = fs.readFileSync(filePathFor(name, dir), "utf8");
        return JSON.parse(raw);
    } catch {
        return null;
    }
}

/**
 * Save a character's state, overwriting any previous save.
 * @param {string} name
 * @param {object} state - Plain, serializable data (password hash plus
 *   whatever game state the caller wants persisted).
 * @param {string} [dir]
 */
export function saveCharacterState(name, state, dir = DEFAULT_CHARACTERS_DIR) {
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(filePathFor(name, dir), JSON.stringify(state, null, 2));
}
