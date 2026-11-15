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
// A routine post (see routine.js) can give its own topics and/or
// unknownTopic, which replace the NPC's while they're at that post: a
// groundskeeper asleep in the storeroom just snores. Like a post's
// behaviors, they replace rather than add to the usual ones.
import { getGameTime } from '../gameClock.js';
import { nameFor } from '../naming.js';
import { currentRoutineEntry } from './routine.js';

const DEFAULT_UNKNOWN = { emote: "doesn't seem to know anything about that." };

// Lowercase words, punctuation dropped: "The Card-Game?" -> "the card game"
function normalize(text) {
    return text
        .toLowerCase()
        .replace(/[^a-z0-9']+/g, ' ')
        .trim();
}

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
}

/**
 * Check an NPC's topics and unknownTopic as written in content, so a typo
 * fails at startup rather than when someone happens to ask.
 * @param {object} npcData - One entry from a zone's npcs.json.
 * @param {string} npcId
 */
export function validateDialogue(npcData, npcId) {
    validateTopics(npcData, `NPC "${npcId}"`);
    (npcData.routine ?? []).forEach((entry, index) =>
        validateTopics(entry, `NPC "${npcId}" routine post ${index + 1}`),
    );
}

function validateTopics({ topics, unknownTopic }, owner) {
    if (topics !== undefined) {
        if (!Array.isArray(topics)) {
            throw new Error(`${owner}: "topics" must be a list.`);
        }
        topics.forEach((topic, index) => {
            const where = `${owner} topic ${index + 1}`;
            const keywords = topic?.keywords;
            if (!Array.isArray(keywords) || keywords.length === 0 || !keywords.every((k) => normalize(String(k)))) {
                throw new Error(`${where} needs a non-empty "keywords" list.`);
            }
            assertAnswer(topic, where);
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
 * @param {number} [hour] - The game hour, for routine posts; overridable
 *   for tests.
 * @returns {{ says?: string, emote?: string }}
 */
export function answerFor(npc, asked, hour = getGameTime().hour) {
    const { topics, unknownTopic } = currentDialogue(npc, hour);
    const padded = ` ${normalize(asked)} `;
    const topic = (topics ?? []).find((t) => t.keywords.some((k) => padded.includes(` ${normalize(k)} `)));
    return topic ?? unknownTopic ?? DEFAULT_UNKNOWN;
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
