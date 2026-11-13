// When world state actually gets saved (see worldData.js/data.js for the
// file I/O itself, and Room/Character's toSaveData/restoreFrom for each
// entity's shape).
//
// Everything goes through one checkpoint, saveWorld: every dirty room *and*
// every in-world character, in the same synchronous pass. Saving the two
// together is the point - an item moving between a room and a character
// (get/drop/put) changes both, and saving one side without the other is
// how an item gets duplicated or lost across a restart. Triggers:
//
//   - a periodic ticker, every WORLD_SAVE_INTERVAL_MS
//   - a character leaving the world (quit/disconnect, see
//     modules/commands/quit.js)
//   - shutdown: SIGINT/SIGTERM, and a best-effort save on a fatal error
//     (see server.js)
//
// A hard kill can still lose up to one interval's changes, but whatever was
// last saved is a consistent snapshot rather than a mix of two moments.
// (Not transactional across files: a kill partway through the pass itself
// can still split one checkpoint - accepted at this scale; each individual
// file write is atomic, see modules/atomicWrite.js.)
//
// NPCs, once they exist and can get/drop/craft on their own, belong in
// saveWorld too, for the same reason characters do.
import { deleteRoomState, loadRoomState, roomStateExists, saveRoomState } from '../worldData.js';
import { characterExists, loadCharacterState, saveCharacterState } from '../data.js';
import { guard } from './guard.js';
import { every } from './scheduler.js';

const WORLD_SAVE_INTERVAL_MS = 60 * 1000;

/**
 * Restore any rooms that have a saved state on disk, replacing their
 * content-seeded defaults (see loadWorldData.js). Rooms with no save yet
 * (first boot, or a room newly added to content) - or an unreadable one -
 * just keep those defaults. Call once at startup, after loadWorldData.
 * @param {import("./World.js").World} world
 * @param {string} [dir] - Overridable so tests can point at a fixture
 *   directory instead of the repo's real rooms/.
 */
export function loadRoomStates(world, dir) {
    for (const room of world.getAllRooms()) {
        migratePreZoneRoomSave(world, room, dir);
        if (!roomStateExists(room.id, dir)) {
            continue;
        }
        const saved = loadRoomState(room.id, dir);
        if (!saved) {
            console.error(`Room "${room.id}" has an unreadable save file - using content defaults.`);
            continue;
        }
        room.restoreFrom(saved);
    }
}

/**
 * Saves from before zones are keyed by the bare room key
 * (rooms/narrow-hallway.json); move one to the room's zone-qualified path
 * (rooms/start/narrow-hallway.json) if that doesn't exist yet. Pre-zone
 * keys were unique world-wide, so a bare key only migrates when exactly
 * one room still ends in it. Remove once no pre-zone saves remain (see
 * ARCHITECTURE.md's "Zones").
 * @param {import("./World.js").World} world
 * @param {import("./Room.js").Room} room
 * @param {string} [dir]
 */
function migratePreZoneRoomSave(world, room, dir) {
    const slash = room.id.indexOf('/');
    if (slash === -1) {
        return;
    }
    const legacyKey = room.id.slice(slash + 1);
    if (!roomStateExists(legacyKey, dir) || roomStateExists(room.id, dir)) {
        return;
    }
    if (world.findRoomAllowingLegacyId(legacyKey) !== room) {
        console.warn(`Not migrating rooms/${legacyKey}.json: more than one zone has a "${legacyKey}" room.`);
        return;
    }
    const saved = loadRoomState(legacyKey, dir);
    if (!saved) {
        return; // unreadable; leave it where it is for a human to look at
    }
    saveRoomState(room.id, saved, dir);
    deleteRoomState(legacyKey, dir);
    console.log(`Moved room save rooms/${legacyKey}.json to rooms/${room.id}.json.`);
}

/**
 * Save every room currently marked dirty, then clear the flag on each one
 * saved. Rooms that aren't dirty are skipped entirely. A room whose save
 * throws stays dirty (retried next checkpoint) and doesn't stop the rest.
 * @param {import("./World.js").World} world
 * @param {string} [dir]
 */
export function saveDirtyRooms(world, dir) {
    for (const room of world.getAllRooms()) {
        if (room.dirty) {
            guard(`saving room "${room.id}"`, () => {
                saveRoomState(room.id, room.toSaveData(), dir);
                room.dirty = false;
            });
        }
    }
}

/**
 * Save one character's game state, merged over their existing record so
 * auth data (the password hash) survives. Refuses to write if a save file
 * exists but can't be read: merging over an empty record would silently
 * drop the password and lock the account, which is worse than skipping
 * one save.
 * @param {import("./Character.js").Character} character
 * @param {string} [dir]
 * @returns {boolean} Whether anything was written.
 */
export function saveCharacter(character, dir) {
    const existing = loadCharacterState(character.name, dir);
    if (!existing && characterExists(character.name, dir)) {
        console.error(`Not saving "${character.name}": their existing save file is unreadable.`);
        return false;
    }
    saveCharacterState(character.name, { ...existing, ...character.toSaveData() }, dir);
    return true;
}

/**
 * Save every player character currently in the world. Not dirty-tracked like
 * rooms: a character's state changes constantly (regen alone ticks every
 * 30s), and one small file per online player is cheap.
 * @param {import("./World.js").World} world
 * @param {string} [dir]
 */
export function saveCharacters(world, dir) {
    for (const room of world.getAllRooms()) {
        for (const character of room.characters) {
            if (character.isNpc) {
                continue; // NPCs respawn from content each boot (see modules/Npc.js)
            }
            guard(`saving character "${character.name}"`, () => saveCharacter(character, dir));
        }
    }
}

/**
 * The one world checkpoint - see the top of this file for why rooms and
 * characters always save together.
 * @param {import("./World.js").World} world
 * @param {{ roomsDir?: string, charactersDir?: string }} [dirs] -
 *   Overridable for tests.
 */
export function saveWorld(world, { roomsDir, charactersDir } = {}) {
    saveDirtyRooms(world, roomsDir);
    saveCharacters(world, charactersDir);
}

/**
 * Start the periodic world-save ticker.
 * @param {import("./World.js").World} world
 * @returns {{ cancel: () => void }} The scheduler job.
 */
export function startWorldSaveTicker(world) {
    return every('periodic world save', WORLD_SAVE_INTERVAL_MS, () => saveWorld(world));
}
