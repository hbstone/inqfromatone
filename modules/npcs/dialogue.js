// Tier 2 dialogue, first slice: NPCs answer `ask <npc> about <topic>` from
// topics written in their content (see ROADMAP.md's tiers and
// ARCHITECTURE.md's "Dialogue"). No memory or state yet - the same question
// gets the same answer.
//
//   "topics": [
//     { "keywords": ["cards", "card game", "poker"], "emote": "nods at the corner table.",
//       "says": "Game starts when there's enough fools to play it." },
//     { "keywords": ["town", "dry creek"], "says": "Not much to it." }
//   ],
//   "unknownTopic": { "emote": "shrugs." }
//
// A topic matches when one of its keywords appears, as whole words, in what
// was asked: "the card game tonight" matches "card game". The first
// matching topic in the list answers, so put specific topics before broad
// ones. An answer is an emote, a spoken line, or both (the emote first).
// With no match, unknownTopic answers, else DEFAULT_UNKNOWN.
//
// An NPC that notices people ("sightings": true, see knowledge.js) can also
// answer about someone it has seen. The order: a topic whose keyword is
// the whole question; then a person it saw, if every word of the question
// names them; then any topic whose keyword appears in the question. So
// "ask the groundskeeper about the cat" gets his line about the cat, while
// a stranger described as "a whiskey-soaked drifter" is asked about as a
// person, not as whiskey.
//
// An NPC that keeps hearsay ("hearsay": true) also answers from what it's
// been told, after people and before loose topics: told "The stage is
// running late", it answers "ask about the stage" with who said so and
// when. Being told something gets its "toldReply" (default: a nod).
//
// A discreet NPC keeps what it knows (sightings, hearsay) to itself unless
// its "discretion" says otherwise, and says so with its refusal rather than
// pretending not to know, which is a clue in itself:
//
//   "discretion": {
//     "sharesWhen": [
//       { "familiar": 3, "sentiment": { "min": 1 } },       // regulars he likes
//       { "sentiment": { "of": "subject", "max": -2 } }     // anyone he can't stand
//     ],
//     "refusal": { "emote": "keeps polishing.", "says": "Couldn't say, friend." }
//   }
//
// sharesWhen is a "when", or a list of them where any one will do; none
// means never. "subject" is who's being asked about (or who said what was
// heard). Asking about yourself, or what you said, is always answered.
//
// A topic can have a "when" (see modules/conditions.js): it only answers
// while that holds, so a later topic with the same keywords, or none, can
// answer the rest of the time. And a topic or unknownTopic marked
// "escalate": true is one a higher brain tier should answer when there is
// one; its own lines are the fallback (see switchboard.js).
//
// A routine post (see routine.js) can give its own topics and/or
// unknownTopic, which replace the NPC's while they're at that post: a
// groundskeeper asleep in the storeroom just snores. Like a post's
// behaviors, they replace rather than add to the usual ones, sightings
// and hearsay included. Whether the NPC takes in what's said to it is up
// to its senses instead (modules/senses.js): the sleeping groundskeeper
// can't hear.
import { getGameTime } from '../gameClock.js';
import { nameFor } from '../naming.js';
import { currentRoutineEntry } from './routine.js';
import { heardAnswer, recallHeard, recallSighting, rememberTold, sightingAnswer } from './knowledge.js';
import { canSense } from '../senses.js';
import { route } from './switchboard.js';
import { validateWhen, whenHolds } from '../conditions.js';
import { subjectKey } from './relationships.js';
import { normalizeText, wordsOf } from '../text.js';

const DEFAULT_UNKNOWN = { emote: "doesn't seem to know anything about that." };
const DEFAULT_TOLD = { emote: 'nods.' };
const DEFAULT_REFUSAL = { emote: 'gives you a long look.', says: "Couldn't say." };

function assertAnswer(answer, where) {
    const isText = (value) => typeof value === 'string' && value.trim() !== '';
    const ok =
        answer &&
        typeof answer === 'object' &&
        (isText(answer.says) || isText(answer.emote)) &&
        (answer.says === undefined || isText(answer.says)) &&
        (answer.emote === undefined || isText(answer.emote));
    if (!ok) {
        throw new Error(`${where} needs a "says" and/or "emote" line.`);
    }
    if (answer.escalate !== undefined && typeof answer.escalate !== 'boolean') {
        throw new Error(`${where}: "escalate" must be true or false.`);
    }
}

/**
 * Check an NPC's topics and unknownTopic as written in content, so a typo
 * fails at startup rather than when someone happens to ask.
 * @param {object} npcData - One entry from a zone's npcs.json.
 * @param {string} npcId
 */
export function validateDialogue(npcData, npcId) {
    validateTopics(npcData, `NPC "${npcId}"`);
    validateDiscretion(npcData.discretion, `NPC "${npcId}"'s "discretion"`);
    if (npcData.toldReply !== undefined) {
        assertAnswer(npcData.toldReply, `NPC "${npcId}"'s "toldReply"`);
    }
    (npcData.routine ?? []).forEach((entry, index) =>
        validateTopics(entry, `NPC "${npcId}" routine post ${index + 1}`),
    );
}

function validateDiscretion(discretion, where) {
    if (discretion === undefined) {
        return;
    }
    if (!discretion || typeof discretion !== 'object' || Array.isArray(discretion)) {
        throw new Error(`${where} must be an object with "sharesWhen" and/or "refusal".`);
    }
    const unknown = Object.keys(discretion).filter((k) => k !== 'sharesWhen' && k !== 'refusal');
    if (unknown.length > 0) {
        throw new Error(`${where} has unknown settings: ${unknown.join(', ')}.`);
    }
    const whens = [discretion.sharesWhen ?? []].flat();
    whens.forEach((when, index) => validateWhen(when, `${where} sharesWhen ${index + 1}`));
    if (discretion.refusal !== undefined) {
        assertAnswer(discretion.refusal, `${where} refusal`);
    }
}

// Whether a discreet NPC will tell the asker what it knows about `key`
// (whoever it saw, or whoever told it something).
function willShare(npc, key, context) {
    if (!npc.discretion || (context.asker && subjectKey(context.asker) === key)) {
        return true;
    }
    const whens = [npc.discretion.sharesWhen ?? []].flat();
    return whens.some((when) => whenHolds(when, { ...context, subject: key }));
}

function validateTopics({ topics, unknownTopic }, owner) {
    if (topics !== undefined) {
        if (!Array.isArray(topics)) {
            throw new Error(`${owner}: "topics" must be a list.`);
        }
        topics.forEach((topic, index) => {
            const where = `${owner} topic ${index + 1}`;
            const keywords = topic?.keywords;
            if (!Array.isArray(keywords) || keywords.length === 0 || !keywords.every((k) => normalizeText(String(k)))) {
                throw new Error(`${where} needs a non-empty "keywords" list.`);
            }
            assertAnswer(topic, where);
            validateWhen(topic.when, where);
        });
    }
    if (unknownTopic !== undefined) {
        assertAnswer(unknownTopic, `${owner}'s "unknownTopic"`);
    }
}

// The topics in effect now: the current post's, if the NPC is at it and
// it gives any, else the NPC's own.
function currentDialogue(npc, hour) {
    const entry = npc.routine && currentRoutineEntry(npc.routine, hour);
    if (entry && npc.roomId === entry.roomId && (entry.topics || entry.unknownTopic)) {
        return { topics: entry.topics ?? [], unknownTopic: entry.unknownTopic ?? null };
    }
    return npc;
}

/**
 * Which answer an NPC gives to a question.
 * @param {import("../Npc.js").Npc} npc
 * @param {string} asked - What the player asked about, as typed.
 * @param {{ asker?: object, room?: object, time?: object, hour?: number, now?: number }} [context] -
 *   Who's asking and where (for sightings and conditions); time (the game
 *   clock's), hour and now (game minutes) are overridable for tests.
 * @returns {{ says?: string, emote?: string }}
 */
export function answerFor(npc, asked, { asker, room, time = getGameTime(), hour = time.hour, now } = {}) {
    const dialogue = currentDialogue(npc, hour);
    const context = { npc, asker, room, time };
    const scripted = (answer) => route(npc, asked, answer, context);
    const topics = (dialogue.topics ?? []).filter((t) => whenHolds(t.when, context));
    const question = wordsOf(asked).join(' ');
    const exact = topics.find((t) => t.keywords.some((k) => wordsOf(k).join(' ') === question));
    if (exact) {
        return scripted(exact);
    }
    if (dialogue === npc && npc.sightings) {
        const sighting = recallSighting(npc, asked, asker, now);
        if (sighting) {
            return willShare(npc, sighting.key, context)
                ? sightingAnswer(sighting, room, now)
                : (npc.discretion.refusal ?? DEFAULT_REFUSAL);
        }
    }
    if (dialogue === npc && npc.hearsay) {
        const heard = recallHeard(npc, asked, now);
        if (heard) {
            return willShare(npc, heard.by.key, context)
                ? heardAnswer(heard, asker, now)
                : (npc.discretion.refusal ?? DEFAULT_REFUSAL);
        }
    }
    const padded = ` ${normalizeText(asked)} `;
    const topic = topics.find((t) => t.keywords.some((k) => padded.includes(` ${normalizeText(k)} `)));
    return scripted(topic ?? dialogue.unknownTopic ?? DEFAULT_UNKNOWN);
}

/**
 * Someone says something straight to an NPC (`sayto`). One that keeps
 * hearsay remembers it if it can hear right now. How it reacts: at a
 * routine post with its own dialogue, that post's unknownTopic if any (the
 * sleeping groundskeeper snores on); else its toldReply, if it heard.
 * @param {import("../Npc.js").Npc} npc
 * @param {object} speaker
 * @param {string} message
 * @param {{ hour?: number, now?: number }} [context] - For tests.
 * @returns {{ says?: string, emote?: string }|null} How the NPC reacts, if
 *   at all.
 */
export function hearTold(npc, speaker, message, { hour = getGameTime().hour, now } = {}) {
    const heard = npc.hearsay && canSense(npc, 'hearing', hour);
    if (heard) {
        rememberTold(npc, speaker, message, now);
    }
    const dialogue = currentDialogue(npc, hour);
    if (dialogue !== npc) {
        return dialogue.unknownTopic;
    }
    return heard ? (npc.toldReply ?? DEFAULT_TOLD) : null;
}

/**
 * An answer as lines for one viewer: the emote, then the spoken line.
 * @param {object} npc
 * @param {{ says?: string, emote?: string }} answer
 * @param {object} viewer
 * @returns {string[]}
 */
export function answerLines(npc, answer, viewer) {
    const name = nameFor(npc, viewer);
    const lines = [];
    if (answer.emote) {
        lines.push(`${name} ${answer.emote}`);
    }
    if (answer.says) {
        lines.push(`${name} says, "${answer.says}"`);
    }
    return lines;
}
