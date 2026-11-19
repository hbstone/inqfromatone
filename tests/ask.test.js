import assert from 'assert/strict';
import { World } from '../modules/World.js';
import { Npc } from '../modules/Npc.js';
import { ask } from '../modules/commands/ask.js';
import { answerFor, validateDialogue } from '../modules/npcs/dialogue.js';
import { setHigherTier } from '../modules/npcs/switchboard.js';
import { reset as resetScheduler } from '../modules/scheduler.js';
import { makeCharacter, lastMessage } from './helpers.js';

const BARTENDER = {
    id: 'test/town/bartender',
    name: 'a mustachioed bartender',
    keywords: ['mustachioed', 'bartender'],
    topics: [
        { keywords: ['card game', 'cards'], emote: 'nods at the corner table.', says: 'Game starts at dusk.' },
        { keywords: ['whiskey'], says: 'Only whiskey in town.' },
        { keywords: ['town'], says: 'Not much to it.' },
    ],
    unknownTopic: { emote: 'keeps polishing the glass.' },
};

function setUp() {
    const world = new World();
    const roomId = world.addRoom('Saloon', 'A saloon.', 'test/town/saloon');
    const room = world.getRoomById(roomId);
    const alice = makeCharacter('Alice');
    const baeron = makeCharacter('Baeron');
    const bartender = new Npc(BARTENDER, roomId);
    const dog = new Npc({ id: 'test/town/dog', name: 'a yellow dog', keywords: ['dog'] }, roomId);
    for (const c of [alice, baeron, bartender, dog]) {
        room.addCharacter(c);
    }
    return { world, alice, baeron, bartender, dog };
}

// An NPC answers from its topics; the asker gets the question and answer
// together, and so does everyone else in the room, from their own view
{
    const { world, alice, baeron } = setUp();
    assert.equal(
        ask(world, ['bartender', 'about', 'whiskey'], alice),
        'You ask a mustachioed bartender about whiskey.\nA mustachioed bartender says, "Only whiskey in town."',
    );
    assert.equal(
        lastMessage(baeron),
        'Alice asks a mustachioed bartender about whiskey.\nA mustachioed bartender says, "Only whiskey in town."',
    );
}

// An emote and a spoken line: the emote first. Keywords match as whole
// words inside a longer question, punctuation and case aside, and
// "about" is optional
{
    const { world, alice } = setUp();
    assert.equal(
        ask(world, ['bartender', 'the', 'Card-Game', 'tonight?'], alice),
        'You ask a mustachioed bartender about the Card-Game tonight.\n' +
            'A mustachioed bartender nods at the corner table.\n' +
            'A mustachioed bartender says, "Game starts at dusk."',
    );
}

// The first matching topic answers; partial words don't match
{
    const { bartender } = setUp();
    assert.equal(answerFor(bartender, 'whiskey in town').says, 'Only whiskey in town.');
    assert.equal(answerFor(bartender, 'townsfolk').emote, 'keeps polishing the glass.', '"town" is not in "townsfolk"');
}

// No match: the NPC's unknownTopic, else a default
{
    const { world, alice, dog } = setUp();
    assert.match(ask(world, ['bartender', 'about', 'horses'], alice), /bartender keeps polishing the glass\.$/);
    assert.equal(answerFor(dog, 'anything').emote, "doesn't seem to know anything about that.");
}

// Asking a player: they see it addressed to them, and answer themselves
{
    const { world, alice, baeron } = setUp();
    assert.equal(ask(world, ['baeron', 'about', 'the', 'road'], alice), 'You ask Baeron about the road.');
    assert.equal(lastMessage(baeron), 'Alice asks you about the road.');
}

// Usage, unknown target, missing topic, and not asking yourself
{
    const { world, alice } = setUp();
    assert.equal(ask(world, [], alice), 'Usage: ask <someone> about <topic>');
    assert.equal(ask(world, ['ghost', 'about', 'town'], alice), "You don't see ghost here.");
    assert.equal(ask(world, ['bartender', 'about'], alice), 'Ask a mustachioed bartender about what?');
    assert.equal(ask(world, ['alice', 'about', 'town'], alice), "You don't see alice here.");
}

// A routine post's dialogue replaces the NPC's while they're at it; on
// the way there, or at a post with no dialogue, the usual topics answer
{
    const world = new World();
    world.addRoom('Yard', 'A yard.', 'test/town/yard');
    world.addRoom('Loft', 'A loft.', 'test/town/loft');
    const keeper = new Npc(
        {
            id: 'test/town/keeper',
            name: 'a groundskeeper',
            topics: [{ keywords: ['weather'], says: 'Rain soon.' }],
            routine: [
                { from: 6, roomId: 'test/town/yard' },
                { from: 20, roomId: 'test/town/loft', unknownTopic: { emote: 'snores.' } },
            ],
        },
        'test/town/yard',
    );
    keeper.roomId = 'test/town/yard';
    assert.equal(answerFor(keeper, 'weather', { hour: 12 }).says, 'Rain soon.', 'day post has no dialogue of its own');
    assert.equal(answerFor(keeper, 'weather', { hour: 22 }).says, 'Rain soon.', 'not at the night post yet');
    keeper.roomId = 'test/town/loft';
    assert.deepEqual(
        answerFor(keeper, 'weather', { hour: 22 }),
        { emote: 'snores.' },
        'asleep: topics are replaced too',
    );
}

// Content checks: problems fail at startup, naming the NPC
{
    const check = (data) => () => validateDialogue(data, 'test/town/npc');
    assert.doesNotThrow(check({}));
    assert.doesNotThrow(check(BARTENDER));
    assert.throws(check({ topics: {} }), /NPC "test\/town\/npc": "topics" must be a list/);
    assert.throws(check({ topics: [{ keywords: [], says: 'Hi.' }] }), /topic 1 needs a non-empty "keywords" list/);
    assert.throws(check({ topics: [{ keywords: ['x'] }] }), /topic 1 needs a "says" and\/or "emote" line/);
    assert.throws(check({ topics: [{ keywords: ['x'], says: 7 }] }), /needs a "says" and\/or "emote" line/);
    assert.throws(check({ unknownTopic: 'shrugs' }), /"unknownTopic" needs a "says" and\/or "emote" line/);
    assert.throws(
        check({ routine: [{ from: 'night', topics: [{ keywords: ['x'] }] }] }),
        /routine post 1 topic 1 needs a "says"/,
    );
}

console.log('All tests passed');

// An escalated question: the room sees it now and the answer when the
// higher tier gives it - unless the asker or the NPC has left by then
{
    const ESCALATING = {
        id: 'test/town/prospector',
        name: 'an old prospector',
        keywords: ['prospector'],
        topics: [{ keywords: ['key'], escalate: true, says: 'Lost one.' }],
    };
    const answers = [];
    setHigherTier(() => new Promise((resolve) => answers.push(resolve)));
    try {
        const { world, alice, baeron } = setUp();
        const room = world.getRoomById(alice.roomId);
        const prospector = new Npc(ESCALATING, room.id);
        room.addCharacter(prospector);

        assert.equal(
            ask(world, ['prospector', 'about', 'the', 'key'], alice),
            'You ask an old prospector about the key.',
        );
        assert.equal(lastMessage(baeron), 'Alice asks an old prospector about the key.');
        answers.shift()({ emote: 'squints.', says: 'Brass, it was.' });
        await new Promise(setImmediate);
        const later = 'An old prospector squints.\nAn old prospector says, "Brass, it was."';
        assert.equal(lastMessage(alice), later);
        assert.equal(lastMessage(baeron), later);
        // Heard, so the NPC remembers saying it
        assert.deepEqual(
            prospector.knowledge.said.map(({ to, asked, emote, says }) => ({ to: to.key, asked, emote, says })),
            [{ to: 'pc:alice', asked: 'the key', emote: 'squints.', says: 'Brass, it was.' }],
        );

        ask(world, ['prospector', 'about', 'the', 'key'], alice);
        room.removeCharacter(alice);
        alice.roomId = null;
        answers.shift()({ says: 'Too late.' });
        await new Promise(setImmediate);
        assert.equal(lastMessage(baeron), 'Alice asks an old prospector about the key.', 'asker left: no answer');
        assert.equal(prospector.knowledge.said.length, 1, 'nobody heard it, so it was never said');

        // Its usual answer isn't remembered: only what a higher tier wrote
        room.addCharacter(alice);
        alice.roomId = room.id;
        ask(world, ['prospector', 'about', 'the', 'key'], alice);
        answers.shift()(null);
        await new Promise(setImmediate);
        assert.equal(lastMessage(alice), 'An old prospector says, "Lost one."');
        assert.equal(prospector.knowledge.said.length, 1);
    } finally {
        setHigherTier(null);
        resetScheduler();
    }
}
