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
import { every } from "../scheduler.js";
import { guard } from "../guard.js";

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
 * Give one NPC its pulse.
 * @param {import("../Npc.js").Npc} npc
 * @param {import("../World.js").World} world
 * @param {() => number} [random]
 */
export function pulseNpc(npc, world, random = Math.random) {
    const entries = Object.entries(npc.behaviors);
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
 * Start pulsing every NPC in the world. One NPC's broken behavior is
 * logged and skipped, not fatal to the rest (see modules/guard.js).
 * @param {import("../World.js").World} world
 * @param {() => number} [random] - Overridable for tests.
 * @returns {{ cancel: () => void }} The scheduler job.
 */
export function startNpcBehaviors(world, random = Math.random) {
    return every("npc behaviors", NPC_PULSE_MS, () => {
        for (const npc of world.npcs) {
            guard(`behaviors for NPC "${npc.templateId}"`, () => pulseNpc(npc, world, random));
        }
    });
}
