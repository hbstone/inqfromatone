// The switchboard (see ROADMAP.md's "Switchboard" and ARCHITECTURE.md's
// "Switchboard"): decides whether a question is answered by the NPC's
// scripted dialogue or handed up to a higher brain tier.
//
// The trigger is content: a topic (or unknownTopic) marked "escalate": true
// is one that deserves nuance. Its own lines are the scripted fallback, so
// it always has an answer:
//
//   { "keywords": ["key"], "escalate": true,
//     "says": "Lost a key once. Never did find what it opened." }
//
// Other triggers from the roadmap ride on the same thing: who's asking, or
// quest state, are conditions in the topic's "when" (see
// modules/conditions.js).
//
// No higher tier exists yet (Phase 6), so the fallback always answers. When
// one does, it's installed with setHigherTier; it gets the NPC (knowledge
// store included), the question and the fallback, and returns an answer or
// null to fall back (over budget, unavailable, nothing to add).

let higherTier = null;

/**
 * Install the handler for escalated questions, or null to remove it.
 * @param {((request: { npc: object, asked: string, fallback: object, context: object }) => object|null)|null} handler
 */
export function setHigherTier(handler) {
    higherTier = handler;
}

/**
 * Route a scripted answer: escalate it if it's marked and a higher tier will
 * take it, else answer as written.
 * @param {object} npc
 * @param {string} asked
 * @param {{ says?: string, emote?: string, escalate?: boolean }} answer
 * @param {object} [context] - Who's asking, where, and when.
 * @returns {{ says?: string, emote?: string }}
 */
export function route(npc, asked, answer, context = {}) {
    if (answer.escalate && higherTier) {
        const better = higherTier({ npc, asked, fallback: answer, context });
        if (better) {
            return better;
        }
    }
    return answer;
}
