import assert from 'assert/strict';
import { Npc } from '../modules/Npc.js';
import { registerCondition, validateWhen, whenHolds } from '../modules/conditions.js';
import { answerFor, validateDialogue } from '../modules/npcs/dialogue.js';
import { setHigherTier } from '../modules/npcs/switchboard.js';
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
// own lines; with one, it goes up, falling back when that returns null.
// Unmarked topics never go up.
{
    const npc = new Npc(PROSPECTOR, 'test/town/saloon');
    assert.equal(answerFor(npc, 'key', { time: DAY }).says, 'Lost a key once.');

    const requests = [];
    setHigherTier((request) => {
        requests.push(request);
        return request.asked.includes('door') ? null : { says: 'A brass one. Opened the old chapel, I reckon.' };
    });
    try {
        const alice = makeCharacter('Alice');
        assert.equal(
            answerFor(npc, 'the key', { asker: alice, time: DAY }).says,
            'A brass one. Opened the old chapel, I reckon.',
        );
        assert.equal(requests[0].npc, npc);
        assert.equal(requests[0].fallback.says, 'Lost a key once.');
        assert.equal(requests[0].context.asker, alice);
        assert.equal(answerFor(npc, 'key to the door', { time: DAY }).says, 'Lost a key once.', 'fell back');
        assert.equal(answerFor(npc, 'whiskey', { time: NIGHT }).says, 'Just the one.');
        assert.equal(requests.length, 2, 'only escalated topics go up');
    } finally {
        setHigherTier(null);
    }
}
