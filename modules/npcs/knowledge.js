// The NPC knowledge store, first slice: sightings (see ROADMAP.md's
// "Knowledge store" and ARCHITECTURE.md's "Knowledge: sightings"). An NPC
// with "sightings": true in its content notices who comes and goes in the
// room it's in, and can answer `ask <npc> about <someone>` from that:
//
//   You ask a mustachioed bartender about the bearded man.
//   A mustachioed bartender says, "A bearded man? Came in from the south a
//   little while ago, headed west."
//
// Each NPC keeps only its latest sighting of each person, for about a game
// day (SIGHTING_MEMORY_MINUTES). People are filed by identity but
// remembered as the NPC saw them - by short description, under
// recognition - and the asker can name them that way or by a name they've
// given them with `remember`.
//
// Shared freely for now: anyone can ask about anyone. Ways around it will
// matter later (sneaking, bribes, how well the NPC knows the asker,
// forgetful or uncooperative NPCs).
import path from 'path';
import { on } from '../events.js';
import { getGameTime } from '../gameClock.js';
import { keywordsFor, nameFor } from '../naming.js';
import { readJsonFile, writeJsonAtomic } from '../atomicWrite.js';
import { npcsDir } from '../saveDirs.js';

export const SIGHTING_MEMORY_MINUTES = 24 * 60;
const MINUTES_PER_DAY = 24 * 60;
const ARTICLES = new Set(['a', 'an', 'the']);

/**
 * Game time as a running count of minutes, for comparing sightings.
 * @param {number} [now] - Real time in ms.
 * @returns {number}
 */
export function gameMinutes(now = Date.now()) {
    const { day, hour, minute } = getGameTime(now);
    return (day - 1) * MINUTES_PER_DAY + hour * 60 + minute;
}

// Identity, not looks: a player by real name, an NPC by template id.
function subjectKey(character) {
    return character.isNpc ? `npc:${character.templateId}` : `pc:${character.name.toLowerCase()}`;
}

/**
 * Lowercase words, punctuation and articles dropped.
 * @param {string} text
 * @returns {string[]}
 */
export function wordsOf(text) {
    return text
        .toLowerCase()
        .replace(/[^a-z0-9']+/g, ' ')
        .split(' ')
        .filter((word) => word && !ARTICLES.has(word));
}

function watchersIn(room, except) {
    return room.characters.filter((c) => c.isNpc && c.sightings && c !== except);
}

function note(npc, subject, fields, now) {
    npc.knowledge.sightings[subjectKey(subject)] = {
        seenAs: nameFor(subject, npc),
        keywords: keywordsFor(subject, npc),
        arrivedFrom: null,
        leftTo: null,
        gone: false,
        ...fields,
        at: now,
    };
    npc.knowledgeDirty = true;
}

function forget(npc, now) {
    for (const [key, sighting] of Object.entries(npc.knowledge.sightings)) {
        if (now - sighting.at > SIGHTING_MEMORY_MINUTES) {
            delete npc.knowledge.sightings[key];
            npc.knowledgeDirty = true;
        }
    }
}

// Event handlers, exported for tests. `now` is game minutes.
export function noticeArrival({ character, room, from }, now = gameMinutes()) {
    for (const npc of watchersIn(room, character)) {
        note(npc, character, { arrivedFrom: from ?? null }, now);
    }
    // An NPC walking in notices who's already there.
    if (character.isNpc && character.sightings) {
        for (const other of room.characters.filter((c) => c !== character)) {
            note(character, other, {}, now);
        }
    }
}

export function noticeDeparture({ character, room, direction }, now = gameMinutes()) {
    for (const npc of watchersIn(room, character)) {
        const before = npc.knowledge.sightings[subjectKey(character)];
        note(npc, character, { arrivedFrom: before?.arrivedFrom ?? null, leftTo: direction ?? null, gone: true }, now);
    }
    // An NPC walking out last saw everyone else here, just now.
    if (character.isNpc && character.sightings) {
        for (const other of room.characters.filter((c) => c !== character)) {
            const before = character.knowledge.sightings[subjectKey(other)];
            note(character, other, { arrivedFrom: before?.arrivedFrom ?? null }, now);
        }
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
    on('characterLeaving', ({ character, room }) => noticeDeparture({ character, room, direction: null }));
}

/**
 * The NPC's latest sighting of whoever `asked` names: every word of it has
 * to be among the words the NPC knows them by, or the words of a name the
 * asker gave them (recognition's `remember`). The most recent match wins.
 * @param {import("../Npc.js").Npc} npc
 * @param {string} asked
 * @param {object} [asker]
 * @param {number} [now] - Game minutes.
 * @returns {object|null} The sighting, with its subject key.
 */
export function recallSighting(npc, asked, asker, now = gameMinutes()) {
    forget(npc, now);
    const words = wordsOf(asked);
    if (words.length === 0) {
        return null;
    }
    const matches = Object.entries(npc.knowledge.sightings)
        .filter(([key, sighting]) => {
            // Recognition files memories by lowercased real name (pc:<name> here).
            const given = key.startsWith('pc:') ? asker?.memories?.[key.slice(3)]?.name : null;
            const names = [sighting.keywords.flatMap(wordsOf), given ? wordsOf(given) : null].filter(Boolean);
            return names.some((known) => words.every((word) => known.includes(word)));
        })
        .map(([key, sighting]) => ({ ...sighting, key }));
    return matches.sort((a, b) => b.at - a.at)[0] ?? null;
}

function whenSeen(at, now) {
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
    const who = sighting.seenAs.charAt(0).toUpperCase() + sighting.seenAs.slice(1);
    if (room?.characters.some((c) => subjectKey(c) === sighting.key)) {
        return { emote: 'nods across the room.', says: `${who}? Right there.` };
    }
    const when = whenSeen(sighting.at, now);
    if (sighting.leftTo) {
        const came = sighting.arrivedFrom ? `Came in from the ${sighting.arrivedFrom}` : 'Saw them';
        return { says: `${who}? ${came} ${when}, headed ${sighting.leftTo}.` };
    }
    if (sighting.gone) {
        return { says: `${who}? Saw them ${when}. Haven't seen them since.` };
    }
    return { says: `${who}? Saw them ${when}.` };
}

/**
 * Load each noticing NPC's sightings, dropping any too old to remember.
 * Call once at startup, after loadWorldData.
 * @param {import("../World.js").World} world
 * @param {string} [dir] - Overridable for tests.
 */
export function loadNpcKnowledge(world, dir = npcsDir(), now = gameMinutes()) {
    for (const npc of world.npcs.filter((n) => n.sightings)) {
        const saved = readJsonFile(path.join(dir, `${npc.templateId}.json`));
        npc.knowledge = { sightings: saved?.sightings ?? {} };
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
    for (const npc of world.npcs.filter((n) => n.sightings)) {
        forget(npc, now);
        if (!npc.knowledgeDirty) {
            continue;
        }
        writeJsonAtomic(path.join(dir ?? npcsDir(), `${npc.templateId}.json`), npc.knowledge);
        npc.knowledgeDirty = false;
    }
}
