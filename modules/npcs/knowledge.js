// The NPC knowledge store (see ROADMAP.md's "Knowledge store" and
// ARCHITECTURE.md's "Knowledge: sightings" and "Knowledge: hearsay"): what
// an NPC has seen and been told, kept apart from how it talks so any brain
// tier can use it.
//
// Hearsay: an NPC with "hearsay": true remembers what's said straight to
// it (`sayto`, see modules/commands/sayto.js) and repeats it when asked
// about something it mentioned:
//
//   A mustachioed bartender says, "A bearded man told me a little while
//   ago: 'The stage is running late.'"
//
// Sightings: an NPC with "sightings": true in its content notices who comes
// and goes in the room it's in, and can answer `ask <npc> about <someone>`
// from that:
//
//   You ask a mustachioed bartender about the bearded man.
//   A mustachioed bartender says, "A bearded man? Came in from the south a
//   little while ago, headed west."
//
// Each NPC keeps only its latest sighting of each person, for about a game
// day (MEMORY_MINUTES). People are filed by identity but
// remembered as the NPC saw them - by short description, under
// recognition - and the asker can name them that way or by a name they've
// given them with `remember`. If the NPC saw someone's look change (they
// passed by again, or changed it right there), the earlier looks still
// count for the day: "A wiry lad? Looks more like a lanky adolescent now."
//
// Shared freely for now: anyone can ask about anyone. Ways around it will
// matter later (sneaking, bribes, how well the NPC knows the asker,
// forgetful or uncooperative NPCs).
import path from 'path';
import { on } from '../events.js';
import { gameMinutes, MINUTES_PER_DAY } from '../gameClock.js';
import { capitalizeFirst } from '../color.js';
import { keywordsFor, nameFor } from '../naming.js';
import { wordsOf } from '../text.js';
import { readJsonFile, writeJsonAtomic } from '../atomicWrite.js';
import { npcsDir } from '../saveDirs.js';
import { canSense } from '../senses.js';

// About a game day. A number, not gameClock's MINUTES_PER_DAY: this module is
// part of an import cycle with gameClock.js (via the content loader), so it
// can only use gameClock's exports inside functions, not at load time.
export const MEMORY_MINUTES = 24 * 60;

// How much something mattered to the NPC, for deciding what it lets go of
// first. Only hearsay uses it so far. It's here for the day this store gets
// condensed (a day's memories into a summary, days into weeks) rather than
// simply expiring: the notable things make the summary, the rest fade.
// Higher is more notable; being told something directly will rank above
// passers-by.
export const NOTABILITY = { told: 2 };

// At most this many things heard at once, and this much of each: a long
// speech is remembered by its start, like most speeches.
export const HEARD_MAX = 30;
export const HEARD_MAX_LENGTH = 300;

/** Whether an NPC keeps a knowledge store at all. */
export function keepsKnowledge(npc) {
    return npc.sightings || npc.hearsay;
}

// Identity, not looks: a player by real name, an NPC by template id.
function subjectKey(character) {
    return character.isNpc ? `npc:${character.templateId}` : `pc:${character.name.toLowerCase()}`;
}

// NPCs here that notice people and can see right now (see modules/senses.js).
function watchersIn(room, except) {
    return room.characters.filter((c) => c !== except && isWatching(c));
}

function isWatching(character) {
    return character.isNpc && character.sightings && canSense(character, 'sight');
}

function note(npc, subject, fields, now) {
    const key = subjectKey(subject);
    const before = npc.knowledge.sightings[key];
    const seenAs = nameFor(subject, npc);
    // Looks the NPC saw earlier, each with when it last saw it
    const earlierLooks = (before?.earlierLooks ?? []).filter((look) => look.seenAs !== seenAs);
    if (before && before.seenAs !== seenAs) {
        earlierLooks.push({ seenAs: before.seenAs, keywords: before.keywords, at: now });
    }
    npc.knowledge.sightings[key] = {
        seenAs,
        keywords: keywordsFor(subject, npc),
        earlierLooks,
        arrivedFrom: null,
        leftTo: null,
        gone: false,
        furtive: false,
        ...fields,
        at: now,
    };
    npc.knowledgeDirty = true;
}

function forget(npc, now) {
    const tooOld = (at) => now - at > MEMORY_MINUTES;
    const heard = npc.knowledge.heard.filter((entry) => !tooOld(entry.at));
    if (heard.length !== npc.knowledge.heard.length) {
        npc.knowledge.heard = heard;
        npc.knowledgeDirty = true;
    }
    for (const [key, sighting] of Object.entries(npc.knowledge.sightings)) {
        if (tooOld(sighting.at)) {
            delete npc.knowledge.sightings[key];
            npc.knowledgeDirty = true;
        } else if (sighting.earlierLooks?.some((look) => tooOld(look.at))) {
            sighting.earlierLooks = sighting.earlierLooks.filter((look) => !tooOld(look.at));
            npc.knowledgeDirty = true;
        }
    }
}

// Event handlers, exported for tests. `now` is game minutes.
// `noticedBy` (see modules/notice.js): how each observer took it. Someone
// sneaking past an NPC that didn't notice leaves no sighting; one that
// caught them at it remembers that too.
function noticed(noticedBy, npc) {
    return noticedBy?.get(npc) ?? 'noticed';
}

export function noticeArrival({ character, room, from, noticedBy }, now = gameMinutes()) {
    for (const npc of watchersIn(room, character)) {
        const how = noticed(noticedBy, npc);
        if (how !== 'unnoticed') {
            note(npc, character, { arrivedFrom: from ?? null, furtive: how === 'suspicious' }, now);
        }
    }
    // An NPC walking in notices who's already there.
    if (isWatching(character)) {
        for (const other of room.others(character)) {
            note(character, other, {}, now);
        }
    }
}

export function noticeDeparture({ character, room, direction, noticedBy }, now = gameMinutes()) {
    for (const npc of watchersIn(room, character)) {
        const how = noticed(noticedBy, npc);
        if (how === 'unnoticed') {
            continue;
        }
        const before = npc.knowledge.sightings[subjectKey(character)];
        note(
            npc,
            character,
            {
                arrivedFrom: before?.arrivedFrom ?? null,
                leftTo: direction ?? null,
                gone: true,
                furtive: how === 'suspicious' || Boolean(before?.furtive),
            },
            now,
        );
    }
    // An NPC walking out last saw everyone else here, just now.
    if (isWatching(character)) {
        for (const other of room.others(character)) {
            const before = character.knowledge.sightings[subjectKey(other)];
            note(character, other, { arrivedFrom: before?.arrivedFrom ?? null }, now);
        }
    }
}

// Someone changed how they look (recognition's `shortdesc`) in front of
// NPCs that notice people. `from` is their old short description, for an
// NPC that hadn't noted them yet (they logged in there, say).
export function noticeNewLook({ character, room, from }, now = gameMinutes()) {
    for (const npc of watchersIn(room, character)) {
        const key = subjectKey(character);
        const before = npc.knowledge.sightings[key];
        if (!before && from) {
            npc.knowledge.sightings[key] = { seenAs: from, keywords: wordsOf(from), earlierLooks: [], at: now };
        }
        note(npc, character, { arrivedFrom: before?.arrivedFrom ?? null }, now);
    }
}

let watching = false;

/** Start noticing comings and goings. Called once from game.js. */
export function watchForSightings() {
    if (watching) {
        return;
    }
    watching = true;
    on('enterRoom', (payload) => noticeArrival(payload));
    on('leaveRoom', (payload) => noticeDeparture(payload));
    // Leaving the game: gone, with no direction.
    // Logging in and out: from and to nowhere in particular.
    on('characterEntering', ({ character, room }) => noticeArrival({ character, room, from: null }));
    on('characterLeaving', ({ character, room }) => noticeDeparture({ character, room, direction: null }));
    on('shortDescChange', (payload) => noticeNewLook(payload));
}

/**
 * The NPC's latest sighting of whoever `asked` names: every word of it has
 * to be among the words of a look the NPC saw them with (latest, or earlier
 * that day), or of a name the asker gave them (recognition's `remember`).
 * The most recent sighting wins.
 * @param {import("../Npc.js").Npc} npc
 * @param {string} asked
 * @param {object} [asker]
 * @param {number} [now] - Game minutes.
 * @returns {object|null} The sighting, with its subject key and
 *   `askedAs`: the look the question matched (the latest one, when it
 *   matched the latest look or the asker's name).
 */
export function recallSighting(npc, asked, asker, now = gameMinutes()) {
    forget(npc, now);
    const words = wordsOf(asked);
    if (words.length === 0) {
        return null;
    }
    const fits = (keywords) => {
        const known = keywords.flatMap(wordsOf);
        return words.every((word) => known.includes(word));
    };
    const matches = [];
    for (const [key, sighting] of Object.entries(npc.knowledge.sightings)) {
        // Recognition files memories by lowercased real name (pc:<name> here).
        const given = key.startsWith('pc:') ? asker?.memories?.[key.slice(3)]?.name : null;
        if (fits(sighting.keywords) || (given && fits([given]))) {
            matches.push({ ...sighting, key, askedAs: sighting.seenAs });
            continue;
        }
        const earlier = (sighting.earlierLooks ?? []).find((look) => fits(look.keywords));
        if (earlier) {
            matches.push({ ...sighting, key, askedAs: earlier.seenAs });
        }
    }
    return matches.sort((a, b) => b.at - a.at)[0] ?? null;
}

function howLongAgo(at, now) {
    const ago = now - at;
    if (ago < 60) {
        return 'just now';
    }
    if (ago < 180) {
        return 'a little while ago';
    }
    return Math.floor(at / MINUTES_PER_DAY) === Math.floor(now / MINUTES_PER_DAY) ? 'earlier today' : 'yesterday';
}

/**
 * What an NPC says about a sighting.
 * @param {object} sighting - From recallSighting.
 * @param {object} [room] - The NPC's room, to tell if they're still here.
 * @param {number} [now] - Game minutes.
 * @returns {{ says: string, emote?: string }}
 */
export function sightingAnswer(sighting, room, now = gameMinutes()) {
    const askedAs = sighting.askedAs ?? sighting.seenAs;
    // "A wiry lad?", plus how they look now if that's changed
    const changed = askedAs === sighting.seenAs ? '' : ` Looks more like ${sighting.seenAs} now.`;
    const who = `${capitalizeFirst(askedAs)}?${changed}`;
    if (room?.characters.some((c) => subjectKey(c) === sighting.key)) {
        return { emote: 'nods across the room.', says: `${who} Right there.` };
    }
    const when = howLongAgo(sighting.at, now);
    // Caught trying not to be seen
    const sly = sighting.furtive ? ' Seemed to be trying not to be noticed, too.' : '';
    if (sighting.leftTo) {
        const came = sighting.arrivedFrom ? `Came in from the ${sighting.arrivedFrom}` : 'Saw them';
        return { says: `${who} ${came} ${when}, headed ${sighting.leftTo}.${sly}` };
    }
    if (sighting.gone) {
        return { says: `${who} Saw them ${when}. Haven't seen them since.${sly}` };
    }
    return { says: `${who} Saw them ${when}.${sly}` };
}

/**
 * Remember something said straight to an NPC that keeps hearsay. Only the
 * latest HEARD_MAX are kept, least notable going first.
 * @param {import("../Npc.js").Npc} npc
 * @param {object} speaker
 * @param {string} message - As it was said.
 * @param {number} [now] - Game minutes.
 */
export function rememberTold(npc, speaker, message, now = gameMinutes()) {
    const text = message.length > HEARD_MAX_LENGTH ? `${message.slice(0, HEARD_MAX_LENGTH).trimEnd()}...` : message;
    npc.knowledge.heard.push({
        kind: 'told',
        by: { key: subjectKey(speaker), seenAs: nameFor(speaker, npc) },
        text,
        notability: NOTABILITY.told,
        at: now,
    });
    while (npc.knowledge.heard.length > HEARD_MAX) {
        const least = Math.min(...npc.knowledge.heard.map((entry) => entry.notability));
        npc.knowledge.heard.splice(
            npc.knowledge.heard.findIndex((entry) => entry.notability === least),
            1,
        );
    }
    npc.knowledgeDirty = true;
}

/**
 * The latest thing an NPC was told that mentions every word of `asked`
 * ("the stage" finds "The stage is running late").
 * @returns {object|null} The heard entry.
 */
export function recallHeard(npc, asked, now = gameMinutes()) {
    forget(npc, now);
    const words = wordsOf(asked);
    if (words.length === 0) {
        return null;
    }
    const mentions = (entry) => {
        const said = wordsOf(entry.text);
        return words.every((word) => said.includes(word));
    };
    return npc.knowledge.heard.filter(mentions).sort((a, b) => b.at - a.at)[0] ?? null;
}

/**
 * What an NPC says about something it was told: who told it, when, and
 * what they said. "You told me" if it's the asker's own words.
 * @returns {{ says: string }}
 */
export function heardAnswer(entry, asker, now = gameMinutes()) {
    const who = asker && subjectKey(asker) === entry.by.key ? 'You' : capitalizeFirst(entry.by.seenAs);
    return { says: `${who} told me ${howLongAgo(entry.at, now)}: '${entry.text}'` };
}

/**
 * Load each NPC's knowledge, dropping anything too old to remember. Call
 * once at startup, after loadWorldData.
 * @param {import("../World.js").World} world
 * @param {string} [dir] - Overridable for tests.
 */
export function loadNpcKnowledge(world, dir = npcsDir(), now = gameMinutes()) {
    for (const npc of world.npcs.filter(keepsKnowledge)) {
        const saved = readJsonFile(path.join(dir, `${npc.templateId}.json`));
        npc.knowledge = { sightings: saved?.sightings ?? {}, heard: saved?.heard ?? [] };
        npc.knowledgeDirty = false;
        forget(npc, now);
    }
}

/**
 * Save the knowledge of every NPC whose knowledge changed. Part of the
 * world checkpoint (see modules/worldPersistence.js).
 * @param {import("../World.js").World} world
 * @param {string} [dir]
 */
export function saveNpcKnowledge(world, dir, now = gameMinutes()) {
    for (const npc of world.npcs.filter(keepsKnowledge)) {
        forget(npc, now);
        if (!npc.knowledgeDirty) {
            continue;
        }
        writeJsonAtomic(path.join(dir ?? npcsDir(), `${npc.templateId}.json`), npc.knowledge);
        npc.knowledgeDirty = false;
    }
}
