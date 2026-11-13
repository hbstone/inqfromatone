// Room state persistence — one JSON file per room under rooms/, mirroring
// data.js's per-character storage adapter shape (see ARCHITECTURE.md). Only
// a room's *mutable* state is saved here (currently just inventory/
// components) - name/description/exits always come from content (content/zones/,
// loadWorldData.js's job), not this module's.
//
// Room ids are content-authored "<zone>/<key>" identifiers (e.g.
// "start/narrow-hallway"), not player input, so - unlike character names in
// data.js - there's no untrusted-input concern about them landing in a
// filesystem path; the content loader also restricts both parts to
// lowercase letters, digits, and dashes. The "/" makes each zone a
// subdirectory: rooms/start/narrow-hallway.json.
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { readJsonFile, writeJsonAtomic } from './modules/atomicWrite.js';

const DEFAULT_ROOMS_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), 'rooms');

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
 * @returns {object|null} The saved record, or null if none exists (or
 *   it exists but is unreadable - see modules/atomicWrite.js).
 */
export function loadRoomState(key, dir = DEFAULT_ROOMS_DIR) {
    return readJsonFile(filePathFor(key, dir));
}

/**
 * Save a room's state, atomically replacing any previous save
 * for that room (see modules/atomicWrite.js). Only
 * ever called for a room that's actually marked dirty (see
 * modules/worldPersistence.js) - callers are responsible for not writing
 * unchanged rooms.
 * @param {string} key
 * @param {object} state - Plain, serializable data (see Room.toSaveData).
 * @param {string} [dir]
 */
export function saveRoomState(key, state, dir = DEFAULT_ROOMS_DIR) {
    writeJsonAtomic(filePathFor(key, dir), state);
}

/**
 * Delete a room's saved state, if any. Used to clear out a pre-zone save
 * once it's been moved to its zone-qualified path (see
 * modules/worldPersistence.js's loadRoomStates).
 * @param {string} key
 * @param {string} [dir]
 */
export function deleteRoomState(key, dir = DEFAULT_ROOMS_DIR) {
    fs.rmSync(filePathFor(key, dir), { force: true });
}
