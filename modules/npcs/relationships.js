// How well an NPC knows someone, and how it feels about them (see
// ARCHITECTURE.md's "Relationships"). Part of the knowledge store, but kept
// for good rather than forgotten after a day like sightings and hearsay:
//
//   - familiarity: how many different game days the NPC has seen them or
//     been told something by them, and when first and last.
//   - sentiment: a number, 0 to start, nudged up or down with a reason by
//     whatever has an opinion (adjustSentiment): the combat pack for
//     starting fights, the western pack for tipping your hat, a pack's
//     purchases or bribes some day. Kept between
//     SENTIMENT_MIN and SENTIMENT_MAX.
//
// Content uses both through conditions, about the asker or about the
// person being asked about (see `discretion` in dialogue.js):
//
//   { "familiar": 3 }                                // asker, 3+ days
//   { "sentiment": { "min": 1 } }                    // asker, liked
//   { "sentiment": { "of": "subject", "max": -2 } }  // them, disliked
//
// Filed by identity, like sightings. So a new look doesn't make a regular a
// stranger to an NPC that knows them: familiarity sees through disguises
// for now.
import { gameMinutes, MINUTES_PER_DAY } from '../gameClock.js';
import { registerCondition, whenHolds } from '../conditions.js';
import { canSense } from '../senses.js';

export const SENTIMENT_MIN = -10;
export const SENTIMENT_MAX = 10;
// The latest changes to sentiment are kept, with their reasons, for the
// day this store is summarized rather than just read.
export const SENTIMENT_LOG_MAX = 20;

/** Identity, not looks: a player by real name, an NPC by template id. */
export function subjectKey(character) {
    return character.isNpc ? `npc:${character.templateId}` : `pc:${character.name.toLowerCase()}`;
}

/**
 * Whether someone is an NPC that would form an opinion of what it sees done
 * right now: it keeps knowledge, and can see. For whoever calls
 * adjustSentiment about something done in front of NPCs.
 */
export function seesAndRemembers(character) {
    return Boolean(character.isNpc && (character.sightings || character.hearsay) && canSense(character, 'sight'));
}

function acquaintance(npc, key) {
    npc.knowledge.acquaintances ??= {};
    npc.knowledge.acquaintances[key] ??= {
        days: 0,
        lastDay: null,
        firstSeen: null,
        lastSeen: null,
        sentiment: 0,
        sentimentLog: [],
    };
    return npc.knowledge.acquaintances[key];
}

/**
 * The NPC has seen someone, or been told something by them: count the day,
 * once per game day.
 * @param {import("../Npc.js").Npc} npc
 * @param {object} subject - Who.
 * @param {number} [now] - Game minutes.
 */
export function meet(npc, subject, now = gameMinutes()) {
    const known = acquaintance(npc, subjectKey(subject));
    const day = Math.floor(now / MINUTES_PER_DAY);
    if (known.lastDay !== day) {
        known.days += 1;
        known.lastDay = day;
    }
    known.firstSeen ??= now;
    known.lastSeen = now;
    npc.knowledgeDirty = true;
}

/**
 * Change how an NPC feels about someone.
 * @param {import("../Npc.js").Npc} npc
 * @param {object} subject - Who.
 * @param {number} delta - Positive likes them more.
 * @param {string} reason - Short, like "started a fight here".
 * @param {{ now?: number, oncePerDay?: boolean }} [options] - now: game
 *   minutes. oncePerDay: skip it if this reason already counted today, so
 *   a pleasantry can't be repeated into friendship.
 * @returns {boolean} Whether it counted.
 */
export function adjustSentiment(npc, subject, delta, reason, { now = gameMinutes(), oncePerDay = false } = {}) {
    const known = acquaintance(npc, subjectKey(subject));
    const today = Math.floor(now / MINUTES_PER_DAY);
    if (
        oncePerDay &&
        known.sentimentLog.some((entry) => entry.reason === reason && Math.floor(entry.at / MINUTES_PER_DAY) === today)
    ) {
        return false;
    }
    known.sentiment = Math.max(SENTIMENT_MIN, Math.min(SENTIMENT_MAX, known.sentiment + delta));
    known.sentimentLog.push({ delta, reason, at: now });
    known.sentimentLog = known.sentimentLog.slice(-SENTIMENT_LOG_MAX);
    npc.knowledgeDirty = true;
    return true;
}

/**
 * Whether a discreet NPC (its content's "discretion", see
 * modules/npcs/dialogue.js) will tell the asker what it knows about `key`:
 * whoever it saw, or whoever told it something. Asking about yourself is
 * always answered.
 * @param {import("../Npc.js").Npc} npc
 * @param {string} key - A subjectKey.
 * @param {{ asker?: object }} context - As for conditions (see
 *   modules/conditions.js).
 */
export function willShare(npc, key, context) {
    if (!npc.discretion || (context.asker && subjectKey(context.asker) === key)) {
        return true;
    }
    const whens = [npc.discretion.sharesWhen ?? []].flat();
    return whens.some((when) => whenHolds(when, { ...context, subject: key }));
}

/**
 * What an NPC knows of someone, by key: { days, sentiment, ... }, or null
 * for a stranger.
 */
export function acquaintanceOf(npc, key) {
    return npc.knowledge?.acquaintances?.[key] ?? null;
}

// Whose relationship a condition is about: the asker by default, or "subject"
// (the person being asked about, as a key in the context).
function whoseKey(of, context) {
    if (of === 'subject') {
        return context.subject ?? null;
    }
    return context.asker ? subjectKey(context.asker) : null;
}

// What's wrong with a { "of", "min", "max" } setting, or null if nothing.
function rangeProblem(value, shape) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        return `must be ${shape}.`;
    }
    const unknown = Object.keys(value).filter((k) => !['of', 'min', 'max'].includes(k));
    if (unknown.length > 0) {
        return `has unknown settings: ${unknown.join(', ')}.`;
    }
    if (value.of !== undefined && value.of !== 'asker' && value.of !== 'subject') {
        return 'has an "of" that must be "asker" or "subject".';
    }
    if (value.min === undefined && value.max === undefined) {
        return 'needs a "min" and/or "max".';
    }
    if ([value.min, value.max].some((n) => n !== undefined && typeof n !== 'number')) {
        return 'needs numbers for "min" and "max".';
    }
    return null;
}

const inRange = (n, { min = -Infinity, max = Infinity }) => n >= min && n <= max;

// { "familiar": 3 } is short for { "familiar": { "min": 3 } }: the asker has
// been seen on 3 or more days.
registerCondition('familiar', {
    test: (value, context) => {
        const range = typeof value === 'number' ? { min: value } : value;
        const known = context.npc && acquaintanceOf(context.npc, whoseKey(range.of, context));
        return inRange(known?.days ?? 0, range);
    },
    validate: (value) =>
        typeof value === 'number'
            ? null
            : rangeProblem(value, 'a number of days, or like { "of": "subject", "min": 3 }'),
});

// { "sentiment": { "min": 1 } }, { "sentiment": { "of": "subject", "max": -2 } }
registerCondition('sentiment', {
    test: (value, context) => {
        const known = context.npc && acquaintanceOf(context.npc, whoseKey(value.of, context));
        return inRange(known?.sentiment ?? 0, value);
    },
    validate: (value) => rangeProblem(value, 'like { "min": 1 } or { "of": "subject", "max": -2 }'),
});
