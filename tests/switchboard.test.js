import assert from 'assert/strict';
import { Npc } from '../modules/Npc.js';
import { registerCondition, validateWhen, whenHolds } from '../modules/conditions.js';
import { answerFor, answerLines, validateDialogue } from '../modules/npcs/dialogue.js';
import { brainContext, renderBrainContext } from '../modules/npcs/brainContext.js';
import { DEFAULT_THINKING, ESCALATION_TIMEOUT_MS, NOT_YET, setHigherTier } from '../modules/npcs/switchboard.js';
import { advance, reset as resetScheduler } from '../modules/scheduler.js';
import { makeCharacter } from './helpers.js';

const NIGHT = { hour: 22, phase: 'night' };
const DAY = { hour: 12, phase: 'day' };

const PROSPECTOR = {
    id: 'test/town/prospector',
    name: 'a red-nosed prospector',
    keywords: ['prospector'],
    topics: [
        { keywords: ['whiskey'], when: { phase: ['day', 'dawn'] }, says: "It's medicinal." },
        { keywords: ['whiskey'], says: 'Just the one.' },
        { keywords: ['key'], escalate: true, says: 'Lost a key once.' },
    ],
    unknownTopic: { emote: 'hiccups.' },
};

// "when": the first matching topic that holds answers
{
    const npc = new Npc(PROSPECTOR, 'test/town/saloon');
    assert.equal(answerFor(npc, 'whiskey', { time: DAY }).says, "It's medicinal.");
    assert.equal(answerFor(npc, 'whiskey', { time: NIGHT }).says, 'Just the one.');
    assert.equal(whenHolds(undefined), true, 'no "when" always holds');
    assert.equal(whenHolds({ phase: 'night' }, { time: NIGHT }), true);
    assert.equal(whenHolds({ phase: 'night' }, { time: DAY }), false);
}

// Packs can add conditions, which see who's asking; every condition in a
// "when" has to hold
{
    registerCondition('askerNamed', {
        test: (name, { asker }) => asker?.name === name,
        validate: (value) => (typeof value === 'string' ? null : 'must be a name.'),
    });
    const alice = makeCharacter('Alice');
    assert.equal(whenHolds({ askerNamed: 'Alice' }, { asker: alice }), true);
    assert.equal(whenHolds({ askerNamed: 'Alice', phase: 'night' }, { asker: alice, time: DAY }), false);
    assert.throws(() => registerCondition('askerNamed', { test: () => true }), /already registered/);
    assert.throws(() => validateWhen({ askerNamed: 3 }, 'T'), /T: condition "askerNamed" must be a name\./);
}

// Content is checked at startup
{
    assert.throws(() => validateWhen({ moon: 'full' }, 'T'), /T: unknown condition "moon" \(known: .*phase/);
    assert.throws(() => validateWhen('night', 'T'), /"when" must be an object/);
    assert.throws(() => validateWhen({ phase: [] }, 'T'), /must be a phase name or a list/);
    const npc = (topic) => () => validateDialogue({ topics: [{ keywords: ['x'], says: 'Hi.', ...topic }] }, 'test/n');
    assert.throws(npc({ when: { moon: 'full' } }), /NPC "test\/n" topic 1: unknown condition "moon"/);
    assert.throws(npc({ escalate: 'yes' }), /"escalate" must be true or false/);
    assert.doesNotThrow(npc({ when: { phase: 'night' }, escalate: true }));
}

// The switchboard: with no higher tier, an escalated topic answers with its
// own lines straight away; with one, the answer is pending, and settles to
// the higher tier's answer, or the fallback when that returns null.
// Unmarked topics never go up.
{
    const npc = new Npc(PROSPECTOR, 'test/town/saloon');
    assert.equal(answerFor(npc, 'key', { time: DAY }).says, 'Lost a key once.');

    const requests = [];
    setHigherTier(async (request) => {
        requests.push(request);
        return request.asked.includes('door') ? null : { says: 'A brass one. Opened the old chapel, I reckon.' };
    });
    try {
        const alice = makeCharacter('Alice');
        const reply = answerFor(npc, 'the key', { asker: alice, time: DAY });
        assert.ok(reply.pending, 'answered later');
        const better = await reply.pending;
        assert.equal(better.says, 'A brass one. Opened the old chapel, I reckon.');
        assert.deepEqual(
            better.higherTier.drewOn,
            ['pc:alice'],
            "marked as the higher tier's, with who it was told about",
        );
        assert.equal(requests[0].npc, npc);
        assert.equal(requests[0].fallback.says, 'Lost a key once.');
        assert.equal(requests[0].context.asker, alice);
        const fellBack = await answerFor(npc, 'key to the door', { time: DAY }).pending;
        assert.equal(fellBack.says, 'Lost a key once.');
        assert.equal(fellBack.higherTier, undefined, "the fallback isn't marked");
        assert.equal(answerFor(npc, 'whiskey', { time: NIGHT }).says, 'Just the one.');
        assert.equal(requests.length, 2, 'only escalated topics go up');
    } finally {
        setHigherTier(null);
    }
}

// Whatever goes wrong up there, the fallback answers: a throw, a
// rejection, something that isn't an answer, or taking too long. Only the
// says/emote lines of an answer come through.
{
    const npc = new Npc(PROSPECTOR, 'test/town/saloon');
    const errors = console.error;
    const warn = console.warn;
    console.error = () => {};
    console.warn = () => {};
    const tries = [
        () => {
            throw new Error('boom');
        },
        async () => {
            throw new Error('rejected');
        },
        () => ({ says: '' }),
        () => 'A brass one.',
    ];
    try {
        for (const higherTier of tries) {
            setHigherTier(higherTier);
            assert.equal((await answerFor(npc, 'key', { time: DAY }).pending).says, 'Lost a key once.');
        }
        setHigherTier(() => ({ says: 'Brass.', escalate: true, extra: 1 }));
        const brass = await answerFor(npc, 'key', { time: DAY }).pending;
        assert.deepEqual(Object.keys(brass).sort(), ['higherTier', 'says']);
        assert.equal(brass.says, 'Brass.');

        resetScheduler();
        setHigherTier(() => new Promise(() => {})); // never answers
        const reply = answerFor(npc, 'key', { time: DAY });
        advance(ESCALATION_TIMEOUT_MS);
        assert.equal((await reply.pending).says, 'Lost a key once.');
        assert.equal(npc.escalating, false, 'free to be asked again');
    } finally {
        console.error = errors;
        console.warn = warn;
        setHigherTier(null);
        resetScheduler();
    }
}

// One question at a time: asked again while still thinking, the NPC says
// so straight away (its "thinking", else DEFAULT_THINKING), rather than
// giving its scripted line
{
    const npc = new Npc(PROSPECTOR, 'test/town/saloon');
    let answer;
    setHigherTier(() => new Promise((resolve) => (answer = resolve)));
    try {
        const first = answerFor(npc, 'key', { time: DAY });
        assert.equal(answerFor(npc, 'key', { time: DAY }), DEFAULT_THINKING);
        answer({ says: 'Brass.' });
        assert.equal((await first.pending).says, 'Brass.');
        assert.ok(answerFor(npc, 'key', { time: DAY }).pending, 'asked again once it answered');

        const ponderer = new Npc({ ...PROSPECTOR, thinking: { emote: 'squints at the ceiling.' } }, 'x');
        answerFor(ponderer, 'key', { time: DAY });
        assert.equal(answerFor(ponderer, 'key', { time: DAY }).emote, 'squints at the ceiling.');
    } finally {
        setHigherTier(null);
        resetScheduler();
    }
}

// "Not yet" from the higher tier (the asker has to wait a moment): the NPC
// looks thoughtful, and that isn't remembered as something it said
{
    const npc = new Npc(PROSPECTOR, 'test/town/saloon');
    setHigherTier(() => NOT_YET);
    try {
        const reply = await answerFor(npc, 'key', { time: DAY }).pending;
        assert.equal(reply, DEFAULT_THINKING);
        assert.equal(reply.higherTier, undefined);
        assert.equal(npc.escalating, false);
    } finally {
        setHigherTier(null);
        resetScheduler();
    }
}

// Notes: text, and only on a topic that escalates, since only a higher tier
// sees them; "thinking" is checked like any answer
{
    const check = (topic) => () =>
        validateDialogue({ topics: [{ keywords: ['key'], says: 'Lost one.', ...topic }] }, 'test/n');
    assert.doesNotThrow(check({ escalate: true, notes: 'Brass. Lost it years back.' }));
    assert.throws(check({ notes: 'Brass.' }), /topic 1: "notes" only reach a higher tier.*"escalate": true/);
    assert.throws(check({ escalate: true, notes: ' ' }), /"notes" must be text/);
    assert.throws(
        () => validateDialogue({ unknownTopic: { says: 'Hm?', notes: 'x' } }, 'test/n'),
        /"unknownTopic": "notes" only reach/,
    );
    assert.throws(() => validateDialogue({ thinking: { says: '' } }, 'test/n'), /"thinking" needs a "says"/);
}

// Notes reach the higher tier with the question; players never see them
{
    const npc = new Npc(
        {
            ...PROSPECTOR,
            topics: [{ keywords: ['key'], escalate: true, says: 'Lost one.', notes: 'Small and brass.' }],
        },
        'test/town/saloon',
    );
    const text = renderBrainContext(brainContext(npc, { time: DAY, now: 0 }), {
        asked: 'the key',
        fallback: npc.topics[0],
    });
    assert.match(text, /^What you know about that \(the asker hasn't been told any of it\): Small and brass\.$/m);
    assert.deepEqual(answerLines(npc, npc.topics[0], makeCharacter('Alice')), [
        'a red-nosed prospector says, "Lost one."',
    ]);
}
