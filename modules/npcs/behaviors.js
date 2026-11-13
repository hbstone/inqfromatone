// Tier 0 NPC brains: behavior tags with a chance to fire (see ROADMAP.md's
// "NPC brains as cognitive LOD" and ARCHITECTURE.md's "NPCs").
//
// Behaviors are a registry, like commands: core registers a couple of
// generic ones (modules/npcs/index.js) and theme packs add their own with
// registerBehavior, without touching this file. An NPC's content lists the
// behaviors it has and their settings:
//
//   "behaviors": {
//     "wander":  { "chance": 0.1 },
//     "ambient": { "chance": 0.2, "says": ["..."], "emotes": ["..."] }
//   }
//
// Every NPC_PULSE_MS each NPC gets one pulse: its behaviors are tried in a
// random order, each firing with its `chance`, and the first one that
// actually does something ends the pulse. So an NPC does at most one thing
// per pulse, and a chance of 0.1 means "about once every 10 pulses".
//
// An NPC with a routine (Tier 1, see routine.js) walks to its current post
// first; walking takes the whole pulse. Once there, the post's behaviors
// replace its usual ones, if the post lists any.
import { every } from '../scheduler.js';
import { guard } from '../guard.js';
import { getGameTime } from '../gameClock.js';
import { movePlayer, OPPOSITES } from '../commands/move.js';
import { currentRoutineEntry, firstStepToward, settleAtPosts, warnAboutUnknownPhases } from './routine.js';

export const NPC_PULSE_MS = 10 * 1000;

const behaviors = new Map();

/**
 * Register a behavior NPCs can be given in content.
 * @param {string} name - The key used under an NPC's "behaviors".
 * @param {(ctx: { npc: import("../Npc.js").Npc, settings: object,
 *   world: import("../World.js").World, random: () => number }) => boolean} run -
 *   Does the behavior once; returns whether it did anything (false lets
 *   the NPC's next behavior have a go this pulse).
 */
export function registerBehavior(name, run) {
    if (behaviors.has(name)) {
        throw new Error(`NPC behavior "${name}" is already registered.`);
    }
    behaviors.set(name, run);
}

/**
 * @param {string} name
 * @returns {boolean}
 */
export function hasBehavior(name) {
    return behaviors.has(name);
}

/**
 * Pick one entry from a list, using the given random source.
 * @template T
 * @param {T[]} list
 * @param {() => number} random
 * @returns {T|undefined}
 */
export function pick(list, random) {
    return list[Math.floor(random() * list.length)];
}

/**
 * Routine handling for one pulse (see routine.js).
 * @returns {{ walked: boolean, behaviors: object }} Whether the NPC spent
 *   the pulse walking to its post, and else which behaviors to run.
 */
function followRoutine(npc, world, hour) {
    const entry = npc.routine && currentRoutineEntry(npc.routine, hour);
    if (!entry) {
        return { walked: false, behaviors: npc.behaviors };
    }
    if (npc.roomId === entry.roomId) {
        npc.unreachablePost = null;
        return { walked: false, behaviors: entry.behaviors ?? npc.behaviors };
    }
    const direction = firstStepToward(world, npc.roomId, entry.roomId);
    if (direction) {
        npc.unreachablePost = null;
        movePlayer(world, npc, world.getRoomById(npc.roomId), direction, OPPOSITES[direction]);
        return { walked: true };
    }
    if (npc.unreachablePost !== entry.roomId) {
        npc.unreachablePost = entry.roomId; // warn once per post, not every pulse
        console.warn(
            `NPC "${npc.templateId}" can't find a way from "${npc.roomId}" to its post "${entry.roomId}"; staying put.`,
        );
    }
    return { walked: false, behaviors: npc.behaviors };
}

/**
 * Give one NPC its pulse.
 * @param {import("../Npc.js").Npc} npc
 * @param {import("../World.js").World} world
 * @param {() => number} [random]
 * @param {number} [hour] - The game hour; overridable for tests.
 */
export function pulseNpc(npc, world, random = Math.random, hour = getGameTime().hour) {
    const { walked, behaviors: active } = followRoutine(npc, world, hour);
    if (walked) {
        return;
    }
    const entries = Object.entries(active);
    // Fisher-Yates, so no behavior always gets first claim on the pulse
    for (let i = entries.length - 1; i > 0; i--) {
        const j = Math.floor(random() * (i + 1));
        [entries[i], entries[j]] = [entries[j], entries[i]];
    }
    for (const [name, settings] of entries) {
        const run = behaviors.get(name);
        if (!run || !(random() < (settings.chance ?? 0))) {
            continue;
        }
        if (run({ npc, settings, world, random })) {
            return;
        }
    }
}

/**
 * Start pulsing every NPC in the world, first putting routine NPCs at
 * their current posts (see routine.js's settleAtPosts). One NPC's broken
 * behavior is logged and skipped, not fatal to the rest (see
 * modules/guard.js). Call after the time settings are loaded.
 * @param {import("../World.js").World} world
 * @param {() => number} [random] - Overridable for tests.
 * @returns {{ cancel: () => void }} The scheduler job.
 */
export function startNpcBehaviors(world, random = Math.random) {
    warnAboutUnknownPhases(world);
    settleAtPosts(world, getGameTime().hour);
    return every('npc behaviors', NPC_PULSE_MS, () => {
        for (const npc of world.npcs) {
            guard(`behaviors for NPC "${npc.templateId}"`, () => pulseNpc(npc, world, random));
        }
    });
}
