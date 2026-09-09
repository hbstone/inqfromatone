// When room state actually gets saved (see worldData.js for the file I/O
// itself, and Room.js's markDirty/toSaveData/restoreFrom for the per-room
// shape). Two triggers today, both reading the same `room.dirty` flag a
// command handler set:
//
//   - a periodic ticker (mirrors combat/regen.js's shape) that saves
//     whatever's dirty every WORLD_SAVE_INTERVAL_MS
//   - a graceful-shutdown save (see server.js's SIGINT/SIGTERM handling)
//     so a normal Ctrl+C doesn't lose the latest interval's changes
//
// A hard crash can still lose up to one interval's worth of room state -
// accepted for now, same "1-2 real users" reasoning ARCHITECTURE.md
// already uses elsewhere to defer stronger guarantees.
//
// `dirty` is deliberately the seam for a *later* switch to save-on-mutation
// instead of polling: that would mean markDirty() itself triggering (or
// debouncing) a saveRoomState call, rather than something else scanning for
// dirty rooms on a timer. The command handlers that call markDirty() today
// wouldn't need to change at all - only what happens after they call it.
import { loadRoomState, roomStateExists, saveRoomState } from "../worldData.js";

const WORLD_SAVE_INTERVAL_MS = 60 * 1000;

/**
 * Restore any rooms that have a saved state on disk, replacing their
 * content-seeded defaults (see loadWorldData.js). Rooms with no save yet
 * (first boot, or a room newly added to content) just keep those
 * defaults. Call once at startup, after loadWorldData.
 * @param {import("./World.js").World} world
 * @param {string} [dir] - Overridable so tests can point at a fixture
 *   directory instead of the repo's real rooms/.
 */
export function loadRoomStates(world, dir) {
    for (const room of world.getAllRooms()) {
        if (roomStateExists(room.id, dir)) {
            room.restoreFrom(loadRoomState(room.id, dir));
        }
    }
}

/**
 * Save every room currently marked dirty, then clear the flag on each one
 * saved. Rooms that aren't dirty are skipped entirely - no whole-world
 * write for a tick where nothing changed, or where only one room did.
 * @param {import("./World.js").World} world
 * @param {string} [dir]
 */
export function saveDirtyRooms(world, dir) {
    for (const room of world.getAllRooms()) {
        if (room.dirty) {
            saveRoomState(room.id, room.toSaveData(), dir);
            room.dirty = false;
        }
    }
}

/**
 * Start the periodic world-save ticker.
 * @param {import("./World.js").World} world
 * @returns {NodeJS.Timeout} The interval handle (e.g. for tests to clear).
 */
export function startWorldSaveTicker(world) {
    return setInterval(() => saveDirtyRooms(world), WORLD_SAVE_INTERVAL_MS);
}
