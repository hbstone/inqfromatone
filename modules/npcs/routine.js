// Tier 1 NPC brains: a daily routine (see ROADMAP.md's NPC tiers and
// ARCHITECTURE.md's "NPC routines").
//
// A routine is a list of posts, each starting at a game hour or a named
// time-of-day phase:
//
//   "routine": [
//     { "from": "dawn", "at": "courtyard", "behaviors": { "ambient": {...} } },
//     { "from": 21, "at": "start/storage-room", "behaviors": { ... } }
//   ]
//
// The entry in effect is the latest one that's started by the current hour;
// before the first one of the day, the last carries over from the night
// before (same rule as time phases). Away from its post, the NPC spends
// each pulse walking one room toward it by the shortest path. At its post,
// the entry's own behaviors run (or the NPC's usual ones, if the entry
// lists none). With no way to get there - a missing room, a severed exit -
// it stays put, falls back to its usual behaviors, and a warning is logged
// once per post.
import { getPhaseStartHour } from "../gameClock.js";
import { OPPOSITES } from "../commands/move.js";

/**
 * The hour a routine entry starts, or null if it names a phase that
 * doesn't exist in the current time settings.
 * @param {{ from: number|string }} entry
 * @returns {number|null}
 */
function startHourOf(entry) {
    return typeof entry.from === "number" ? entry.from : getPhaseStartHour(entry.from);
}

/**
 * The routine entry in effect at an hour.
 * @param {object[]} routine
 * @param {number} hour - 0 to 23.
 * @returns {object|null}
 */
export function currentRoutineEntry(routine, hour) {
    const timed = routine
        .map(entry => ({ entry, start: startHourOf(entry) }))
        .filter(({ start }) => start !== null)
        .sort((a, b) => a.start - b.start);
    if (timed.length === 0) {
        return null;
    }
    let current = timed[timed.length - 1].entry;
    for (const { entry, start } of timed) {
        if (start <= hour) {
            current = entry;
        }
    }
    return current;
}

/**
 * The first step of a shortest path between two rooms, by breadth-first
 * search over exits. Only directions movement understands (north, south,
 * east, west) count.
 * @param {import("../World.js").World} world
 * @param {string} fromId
 * @param {string} toId
 * @returns {string|null} The direction to take, or null if there's no way
 *   there (or you're already there).
 */
export function firstStepToward(world, fromId, toId) {
    if (fromId === toId || !world.getRoomById(toId)) {
        return null;
    }
    // room id -> the direction taken out of fromId to start the path there
    const firstSteps = new Map([[fromId, null]]);
    const queue = [fromId];
    while (queue.length > 0) {
        const id = queue.shift();
        const room = world.getRoomById(id);
        for (const [direction, nextId] of Object.entries(room?.exits ?? {})) {
            if (!OPPOSITES[direction] || firstSteps.has(nextId) || !world.getRoomById(nextId)) {
                continue;
            }
            const firstStep = firstSteps.get(id) ?? direction;
            if (nextId === toId) {
                return firstStep;
            }
            firstSteps.set(nextId, firstStep);
            queue.push(nextId);
        }
    }
    return null;
}

/**
 * Put routine NPCs straight at their current posts, without walking or any
 * messages. Called once at startup, so a server that boots at night doesn't
 * have everyone visibly trooping off to bed.
 * @param {import("../World.js").World} world
 * @param {number} hour
 */
export function settleAtPosts(world, hour) {
    for (const npc of world.npcs) {
        const entry = npc.routine && currentRoutineEntry(npc.routine, hour);
        const post = entry && world.getRoomById(entry.roomId);
        if (!post || post.id === npc.roomId) {
            continue;
        }
        world.getRoomById(npc.roomId)?.removeCharacter(npc);
        post.addCharacter(npc);
    }
}

/**
 * Warn about routine entries keyed to a phase the time settings don't
 * define (a typo, or a phase since renamed); those entries never take
 * effect. Checked at startup rather than at content load, since the time
 * settings load separately.
 * @param {import("../World.js").World} world
 */
export function warnAboutUnknownPhases(world) {
    const warned = new Set();
    for (const npc of world.npcs) {
        for (const entry of npc.routine ?? []) {
            const key = `${npc.templateId}:${entry.from}`;
            if (typeof entry.from === "string" && getPhaseStartHour(entry.from) === null && !warned.has(key)) {
                warned.add(key);
                console.warn(`NPC "${npc.templateId}" has a routine entry from unknown phase "${entry.from}"; it will be ignored.`);
            }
        }
    }
}
