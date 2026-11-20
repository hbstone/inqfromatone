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
// one does, it's installed with setHigherTier; it gets the NPC, the
// question, the fallback, and `view`: what the NPC knows and would share
// with this asker (see brainContext.js, which can also render it as text).
// A tier should work from the view, not npc.knowledge, which holds what
// discretion keeps back too. It returns an answer, null to fall back (over
// budget, unavailable, nothing to add), or NOT_YET: it would answer, just
// not this moment (the asker has to wait a little between questions).
//
// A higher tier takes time (an LLM call is seconds), so an escalated
// question is answered later: route hands back { pending }, a promise of
// the answer, and the caller (ask) delivers it when it settles. The promise
// never rejects and never takes longer than ESCALATION_TIMEOUT_MS: a
// failure, a timeout, or something that isn't an answer all become the
// fallback. One question at a time per NPC: asked again while it's still
// thinking, it says so straight away.
//
// "Not yet" isn't "I don't know": rather than its scripted line, which
// mid-conversation reads like forgetting, the NPC shows it's thinking (its
// content's "thinking", else DEFAULT_THINKING), so the player knows to
// give it a moment and ask again.
//
// An answer from the higher tier comes back marked `higherTier: { drewOn }`
// (who the view told it about), so the caller can have the NPC remember
// saying it once someone's heard it (knowledge.js's rememberSaid). The
// fallback isn't marked: the NPC's usual answer needs no remembering.
import { guardAsync } from '../guard.js';
import { after } from '../scheduler.js';
import { brainContext } from './brainContext.js';

export const ESCALATION_TIMEOUT_MS = 10_000;

// What a higher tier returns for "ask me again in a moment".
export const NOT_YET = Object.freeze({ notYet: true });

// No voice of its own, so it suits any NPC.
export const DEFAULT_THINKING = Object.freeze({ emote: 'pauses, thinking it over.' });

const thinking = (npc) => npc.thinking ?? DEFAULT_THINKING;

let higherTier = null;

/**
 * Install the handler for escalated questions, or null to remove it.
 * @param {((request: { npc: object, asked: string, fallback: object, context: object, view: object }) =>
 *   (object|null|Promise<object|null>))|null} handler
 */
export function setHigherTier(handler) {
    higherTier = handler;
}

// Only a says and/or emote line, each non-empty text, comes through.
function asAnswer(value) {
    const isText = (text) => typeof text === 'string' && text.trim() !== '';
    if (!value || typeof value !== 'object' || !(isText(value.says) || isText(value.emote))) {
        return null;
    }
    return {
        ...(isText(value.emote) ? { emote: value.emote } : {}),
        ...(isText(value.says) ? { says: value.says } : {}),
    };
}

function escalate(handler, npc, asked, fallback, context) {
    npc.escalating = true;
    return new Promise((resolve) => {
        let settled = false;
        const finish = (answer) => {
            if (settled) {
                return;
            }
            settled = true;
            timeout.cancel();
            npc.escalating = false;
            resolve(answer);
        };
        const timeout = after(`escalation timeout for ${npc.templateId}`, ESCALATION_TIMEOUT_MS, () => {
            console.warn(`Higher tier took too long answering ${npc.templateId} about "${asked}"; fell back.`);
            finish(fallback);
        });
        let view;
        const request = () => {
            view = brainContext(npc, context);
            return handler({ npc, asked, fallback, context, view });
        };
        guardAsync(`higher tier for ${npc.templateId}`, request, null).then((better) => {
            if (better?.notYet === true) {
                finish(thinking(npc));
                return;
            }
            const answer = asAnswer(better);
            if (better && !answer) {
                console.warn(`Higher tier gave ${npc.templateId} something that isn't an answer; fell back.`);
            }
            finish(answer ? { ...answer, higherTier: { drewOn: view.drewOn } } : fallback);
        });
    });
}

/**
 * Route a scripted answer: escalate it if it's marked and a higher tier will
 * take it, else answer as written.
 * @param {object} npc
 * @param {string} asked
 * @param {{ says?: string, emote?: string, escalate?: boolean }} answer
 * @param {object} [context] - Who's asking, where, and when.
 * @returns {{ says?: string, emote?: string }|{ pending: Promise<{ says?: string, emote?: string }> }}
 */
export function route(npc, asked, answer, context = {}) {
    if (!answer.escalate || !higherTier) {
        return answer;
    }
    if (npc.escalating) {
        return thinking(npc); // still answering someone
    }
    return { pending: escalate(higherTier, npc, asked, answer, context) };
}
