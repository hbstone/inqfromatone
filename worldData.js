// Room state persistence — one JSON file per room under the running game's
// saves/<game>/rooms/ (see modules/saveDirs.js), mirroring
// data.js's per-character storage adapter shape (see ARCHITECTURE.md). Only
// a room's *mutable* state is saved here (currently just inventory/
// components) - name/description/exits always come from content (content/zones/,
// loadWorldData.js's job), not this module's.
//
// Room ids are content-authored "<pack>/<zone>/<key>" identifiers (e.g.
// "starter/start/narrow-hallway"), not player input, so - unlike character names in
// data.js - there's no untrusted-input concern about them landing in a
// filesystem path; the content loader also restricts every part to
// lowercase letters, digits, and dashes. Each "/" makes a
// subdirectory: saves/default/rooms/starter/start/narrow-hallway.json.
import fs from 'fs';
import path from 'path';
import { readJsonFile, writeJsonAtomic } from './modules/atomicWrite.js';
import { roomsDir } from './modules/saveDirs.js';

function filePathFor(key, dir) {
    return path.join(dir, `${key}.json`);
}

/**
 * Whether a room has a saved state on disk.
 * @param {string} key
 * @param {string} [dir]
 * @returns {boolean}
 */
export function roomStateExists(key, dir = roomsDir()) {
    return fs.existsSync(filePathFor(key, dir));
}

/**
 * Load a room's saved state.
 * @param {string} key
 * @param {string} [dir]
 * @returns {object|null} The saved record, or null if none exists (or
 *   it exists but is unreadable - see modules/atomicWrite.js).
 */
export function loadRoomState(key, dir = roomsDir()) {
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
export function saveRoomState(key, state, dir = roomsDir()) {
    writeJsonAtomic(filePathFor(key, dir), state);
}

/**
 * Delete a room's saved state, if any. Used to clear out a pre-zone save
 * once it's been moved to its zone-qualified path (see
 * modules/worldPersistence.js's loadRoomStates).
 * @param {string} key
 * @param {string} [dir]
 */
export function deleteRoomState(key, dir = roomsDir()) {
    fs.rmSync(filePathFor(key, dir), { force: true });
}
