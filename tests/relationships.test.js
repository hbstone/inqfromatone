import assert from 'assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { World } from '../modules/World.js';
import { Npc } from '../modules/Npc.js';
import { validateWhen, whenHolds } from '../modules/conditions.js';
import { answerFor, validateDialogue } from '../modules/npcs/dialogue.js';
import {
    noticeArrival,
    noticeDeparture,
    rememberTold,
    loadNpcKnowledge,
    saveNpcKnowledge,
    MEMORY_MINUTES,
} from '../modules/npcs/knowledge.js';
import {
    acquaintanceOf,
    adjustSentiment,
    meet,
    SENTIMENT_LOG_MAX,
    SENTIMENT_MAX,
    SENTIMENT_MIN,
} from '../modules/npcs/relationships.js';
import { makeCharacter } from './helpers.js';

const DAY = 24 * 60;
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'relationships-'));

const BARTENDER = {
    id: 'test/town/bartender',
    name: 'a mustachioed bartender',
    keywords: ['bartender'],
    sightings: true,
    hearsay: true,
    discretion: {
        sharesWhen: [{ familiar: 3, sentiment: { min: 1 } }, { sentiment: { of: 'subject', max: -2 } }],
        refusal: { emote: 'keeps polishing.', says: "Couldn't say, friend." },
    },
};

function setUp(template = BARTENDER) {
    const world = new World();
    world.addRoom('Saloon', 'A saloon.', 'test/town/saloon');
    const saloon = world.getRoomById('test/town/saloon');
    const bartender = new Npc(template, saloon.id);
    const alice = makeCharacter('Alice');
    const baeron = makeCharacter('Baeron');
    saloon.addCharacter(bartender);
    saloon.addCharacter(baeron);
    return { world, saloon, bartender, alice, baeron };
}

// Alice walks in and out at `at`
function visit(saloon, alice, at) {
    saloon.addCharacter(alice);
    noticeArrival({ character: alice, room: saloon, from: 'south' }, at);
    noticeDeparture({ character: alice, room: saloon, direction: 'west' }, at);
    saloon.removeCharacter(alice);
}

// Familiarity: one count per game day seen or spoken to, kept for good
{
    const { saloon, bartender, alice } = setUp();
    visit(saloon, alice, DAY + 60);
    visit(saloon, alice, DAY + 120);
    assert.equal(acquaintanceOf(bartender, 'pc:alice').days, 1, 'twice in a day is one day');
    visit(saloon, alice, 2 * DAY + 60);
    rememberTold(bartender, alice, 'Evening.', 3 * DAY);
    const known = acquaintanceOf(bartender, 'pc:alice');
    assert.equal(known.days, 3);
    assert.equal(known.firstSeen, DAY + 60);
    assert.equal(known.lastSeen, 3 * DAY);
    assert.equal(acquaintanceOf(bartender, 'pc:nobody'), null);

    // Saved and loaded, and not forgotten with the day's sightings
    const dir = path.join(tmp, 'npcs');
    saveNpcKnowledge({ npcs: [bartender] }, dir, 3 * DAY);
    const later = new Npc(BARTENDER, saloon.id);
    loadNpcKnowledge({ npcs: [later] }, dir, 3 * DAY + MEMORY_MINUTES * 10);
    assert.deepEqual(later.knowledge.sightings, {});
    assert.equal(acquaintanceOf(later, 'pc:alice').days, 3);
}

// Sentiment: nudged with a reason, kept in range, latest reasons kept
{
    const { bartender, alice } = setUp();
    adjustSentiment(bartender, alice, 3, 'tipped well', { now: 10 });
    adjustSentiment(bartender, alice, -1, 'spilled a drink', { now: 20 });
    const known = acquaintanceOf(bartender, 'pc:alice');
    assert.equal(known.sentiment, 2);
    assert.deepEqual(known.sentimentLog.at(-1), { delta: -1, reason: 'spilled a drink', at: 20 });
    assert.equal(known.days, 0, 'an opinion is not a visit');
    adjustSentiment(bartender, alice, 100, 'saved his life');
    assert.equal(known.sentiment, SENTIMENT_MAX);
    adjustSentiment(bartender, alice, -100, 'burned the saloon down');
    assert.equal(known.sentiment, SENTIMENT_MIN);
    for (let i = 0; i < SENTIMENT_LOG_MAX + 5; i++) {
        adjustSentiment(bartender, alice, 0, `shrug ${i}`);
    }
    assert.equal(known.sentimentLog.length, SENTIMENT_LOG_MAX);

    // Once a day, when asked to
    const { bartender: b, baeron } = setUp();
    assert.equal(adjustSentiment(b, baeron, 1, 'tipped his hat', { now: DAY, oncePerDay: true }), true);
    assert.equal(adjustSentiment(b, baeron, 1, 'tipped his hat', { now: DAY + 600, oncePerDay: true }), false);
    assert.equal(adjustSentiment(b, baeron, 1, 'tipped his hat', { now: 2 * DAY, oncePerDay: true }), true);
    assert.equal(acquaintanceOf(b, 'pc:baeron').sentiment, 2);
}

// The conditions: about the asker by default, or the subject
{
    const { bartender, alice, baeron } = setUp();
    for (let day = 1; day <= 3; day++) {
        meet(bartender, baeron, day * DAY);
    }
    adjustSentiment(bartender, alice, -3, 'started a fight here');
    const context = { npc: bartender, asker: baeron, subject: 'pc:alice' };
    assert.equal(whenHolds({ familiar: 3 }, context), true);
    assert.equal(whenHolds({ familiar: 4 }, context), false);
    assert.equal(whenHolds({ familiar: { of: 'subject', max: 0 } }, context), true, 'never seen Alice');
    assert.equal(whenHolds({ sentiment: { min: 0 } }, context), true, 'neutral toward the asker');
    assert.equal(whenHolds({ sentiment: { of: 'subject', max: -2 } }, context), true);
    assert.equal(whenHolds({ familiar: 1 }, { npc: bartender }), false, 'nobody asking');

    assert.doesNotThrow(() => validateWhen({ familiar: 3, sentiment: { of: 'subject', max: -2 } }, 'T'));
    assert.throws(() => validateWhen({ familiar: 'often' }, 'T'), /condition "familiar" must be a number of days/);
    assert.throws(() => validateWhen({ sentiment: 2 }, 'T'), /condition "sentiment" must be like/);
    assert.throws(
        () => validateWhen({ sentiment: { of: 'bob', min: 1 } }, 'T'),
        /"of" that must be "asker" or "subject"/,
    );
    assert.throws(() => validateWhen({ sentiment: { of: 'subject' } }, 'T'), /needs a "min" and\/or "max"/);
    assert.throws(() => validateWhen({ sentiment: { least: 1 } }, 'T'), /unknown settings: least/);
}

// Discretion: a stranger gets the refusal (not "doesn't know"); a liked
// regular, or anyone asking about someone he can't stand, gets the answer;
// you can always ask about yourself
{
    const { saloon, bartender, alice, baeron } = setUp();
    visit(saloon, alice, DAY);
    const ask = (asker, about) => answerFor(bartender, about, { asker, room: saloon, now: DAY + 30 });
    assert.deepEqual(ask(baeron, 'alice'), BARTENDER.discretion.refusal);
    assert.match(ask(alice, 'alice').says, /Came in from the south/, 'about yourself');
    assert.equal(
        ask(baeron, 'the moon').emote,
        "doesn't seem to know anything about that.",
        'not known is not refused',
    );

    for (let day = 1; day <= 3; day++) {
        meet(bartender, baeron, day * DAY);
    }
    assert.deepEqual(ask(baeron, 'alice'), BARTENDER.discretion.refusal, 'a regular, but not liked yet');
    adjustSentiment(bartender, baeron, 1, 'tipped');
    assert.match(ask(baeron, 'alice').says, /Came in from the south/);

    const { bartender: other, saloon: room2, alice: a2, baeron: b2 } = setUp();
    visit(room2, a2, DAY);
    adjustSentiment(other, a2, -2, 'started a fight here');
    assert.match(answerFor(other, 'alice', { asker: b2, room: room2, now: DAY + 30 }).says, /Came in/, 'sold out');
}

// Hearsay too, by who said it; and a discreet NPC with no sharesWhen never
// shares, with a default refusal
{
    const { bartender, alice, baeron } = setUp({ ...BARTENDER, discretion: {} });
    rememberTold(bartender, alice, 'The stage is late.', DAY);
    assert.deepEqual(answerFor(bartender, 'stage', { asker: baeron, now: DAY + 1 }), {
        emote: 'gives you a long look.',
        says: "Couldn't say.",
    });
    assert.match(answerFor(bartender, 'stage', { asker: alice, now: DAY + 1 }).says, /^You told me/);
}

// Content is checked at startup
{
    const check = (discretion) => () => validateDialogue({ discretion }, 'test/n');
    assert.doesNotThrow(check(BARTENDER.discretion));
    assert.doesNotThrow(check({ sharesWhen: { familiar: 2 } }));
    assert.throws(check('yes'), /"discretion" must be an object/);
    assert.throws(check({ sharesWith: {} }), /unknown settings: sharesWith/);
    assert.throws(check({ sharesWhen: [{ moon: 'full' }] }), /sharesWhen 1: unknown condition "moon"/);
    assert.throws(check({ refusal: {} }), /refusal needs a "says" and\/or "emote"/);
}

fs.rmSync(tmp, { recursive: true, force: true });
