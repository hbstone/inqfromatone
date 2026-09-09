// Room state persistence — one JSON file per room under rooms/, mirroring
// data.js's per-character storage adapter shape (see ARCHITECTURE.md). Only
// a room's *mutable* state is saved here (currently just inventory/
// components) - name/description/exits always come from content/rooms.json,
// loadWorldData.js's job, not this module's.
//
// Room keys are content-authored identifiers (e.g. "narrow-hallway"), not
// player input, so - unlike character names in data.js - there's no
// untrusted-input allowlist concern about them landing in a filesystem path.
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const DEFAULT_ROOMS_DIR = path.join(
    path.dirname(fileURLToPath(import.meta.url)),
    "rooms"
);

function filePathFor(key, dir) {
    return path.join(dir, `${key}.json`);
}

/**
 * Whether a room has a saved state on disk.
 * @param {string} key
 * @param {string} [dir]
 * @returns {boolean}
 */
export function roomStateExists(key, dir = DEFAULT_ROOMS_DIR) {
    return fs.existsSync(filePathFor(key, dir));
}

/**
 * Load a room's saved state.
 * @param {string} key
 * @param {string} [dir]
 * @returns {object|null} The saved record, or null if none exists.
 */
export function loadRoomState(key, dir = DEFAULT_ROOMS_DIR) {
    try {
        const raw = fs.readFileSync(filePathFor(key, dir), "utf8");
        return JSON.parse(raw);
    } catch {
        return null;
    }
}

/**
 * Save a room's state, overwriting any previous save for that room. Only
 * ever called for a room that's actually marked dirty (see
 * modules/worldPersistence.js) - callers are responsible for not writing
 * unchanged rooms.
 * @param {string} key
 * @param {object} state - Plain, serializable data (see Room.toSaveData).
 * @param {string} [dir]
 */
export function saveRoomState(key, state, dir = DEFAULT_ROOMS_DIR) {
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(filePathFor(key, dir), JSON.stringify(state, null, 2));
}
