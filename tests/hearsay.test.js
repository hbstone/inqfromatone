import assert from 'assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { World } from '../modules/World.js';
import { Npc } from '../modules/Npc.js';
import { ask } from '../modules/commands/ask.js';
import { sayto } from '../modules/commands/sayto.js';
import { enableRecognition } from '../modules/recognition/index.js';
import { hearTold, validateDialogue } from '../modules/npcs/dialogue.js';
import {
    HEARD_MAX,
    HEARD_MAX_LENGTH,
    loadNpcKnowledge,
    MEMORY_MINUTES,
    recallHeard,
    rememberTold,
    saveNpcKnowledge,
} from '../modules/npcs/knowledge.js';
import { makeCharacter, lastMessage } from './helpers.js';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'hearsay-'));
enableRecognition({ charactersDir: path.join(tmp, 'characters') }); // NPCs see strangers by short description

const BARTENDER = {
    id: 'test/town/bartender',
    name: 'a mustachioed bartender',
    keywords: ['bartender'],
    hearsay: true,
    topics: [{ keywords: ['whiskey'], says: 'Only whiskey in town.' }],
};

function setUp(template = BARTENDER) {
    const world = new World();
    world.addRoom('Saloon', 'A saloon.', 'test/town/saloon');
    const saloon = world.getRoomById('test/town/saloon');
    const bartender = new Npc(template, saloon.id);
    const dog = new Npc({ id: 'test/town/dog', name: 'a yellow dog', keywords: ['dog'] }, saloon.id);
    world.npcs.push(bartender, dog);
    const alice = makeCharacter('Alice', { shortDesc: 'a bearded man' });
    const baeron = makeCharacter('Baeron', { shortDesc: 'a tall woman' });
    for (const c of [bartender, dog, alice, baeron]) {
        saloon.addCharacter(c);
    }
    return { world, saloon, bartender, dog, alice, baeron };
}

const reply = (result) => result.split('\n').slice(1).join('\n');

// sayto: the room hears it, the target is "you", an NPC that keeps
// hearsay nods and remembers
{
    const { world, bartender, alice, baeron } = setUp();
    assert.equal(
        sayto(world, ['bartender', 'the', 'stage', 'is', 'running', 'late'], alice),
        'You say to a mustachioed bartender, "The stage is running late."\nA mustachioed bartender nods.',
    );
    assert.equal(
        lastMessage(baeron),
        'A bearded man says to a mustachioed bartender, "The stage is running late."\nA mustachioed bartender nods.',
    );
    assert.equal(bartender.knowledge.heard.length, 1);
    assert.equal(bartender.knowledge.heard[0].by.seenAs, 'a bearded man');
    assert.equal(bartender.knowledgeDirty, true);

    assert.equal(
        reply(ask(world, ['bartender', 'about', 'the', 'stage?'], baeron)),
        `A mustachioed bartender says, "A bearded man told me just now: 'The stage is running late.'"`,
    );
    assert.match(reply(ask(world, ['bartender', 'about', 'stage'], alice)), /"You told me just now:/);
    assert.match(
        reply(ask(world, ['bartender', 'about', 'the', 'stage', 'robbery'], baeron)),
        /doesn't seem to know anything about that/,
        'every word has to be in what was said',
    );
}

// Between players it's just speech; "you" for the one spoken to
{
    const { world, alice, baeron } = setUp();
    assert.equal(sayto(world, ['tall', 'evening'], alice), 'You say to a tall woman, "Evening."');
    assert.equal(lastMessage(baeron), 'A bearded man says to you, "Evening."');
    assert.equal(sayto(world, ['nobody', 'hi'], alice), "You don't see nobody here.");
    assert.equal(sayto(world, ['tall'], alice), 'Usage: sayto <someone> <message>');
}

// An NPC without hearsay doesn't react or remember
{
    const { world, dog, alice } = setUp();
    assert.equal(sayto(world, ['dog', 'good', 'boy'], alice), 'You say to a yellow dog, "Good boy."');
    assert.deepEqual(dog.knowledge.heard, []);
}

// A toldReply of its own; a whole-question topic still beats hearsay, but
// hearsay beats a topic word somewhere in the question
{
    const { world, bartender, alice, baeron } = setUp({
        ...BARTENDER,
        toldReply: { emote: 'grunts.', says: "I'll keep it in mind." },
    });
    assert.equal(
        reply(sayto(world, ['bartender', 'whiskey', 'prices', 'went', 'up'], alice)),
        `A mustachioed bartender grunts.\nA mustachioed bartender says, "I'll keep it in mind."`,
    );
    assert.match(reply(ask(world, ['bartender', 'whiskey'], baeron)), /Only whiskey in town/);
    assert.match(reply(ask(world, ['bartender', 'whiskey', 'prices'], baeron)), /told me just now: 'Whiskey prices/);
    assert.equal(bartender.knowledge.heard.length, 1);
}

// The latest mention wins; forgotten after a game day; long speeches are
// kept by their start; only HEARD_MAX at once
{
    const { bartender, alice, baeron } = setUp();
    rememberTold(bartender, alice, 'The stage is late.', 100);
    rememberTold(bartender, baeron, 'The stage came in.', 200);
    assert.equal(recallHeard(bartender, 'stage', 210).text, 'The stage came in.');
    assert.equal(recallHeard(bartender, 'late stage', 210).text, 'The stage is late.');
    assert.equal(recallHeard(bartender, 'stage', 100 + MEMORY_MINUTES + 1).text, 'The stage came in.');
    assert.equal(recallHeard(bartender, 'late', 100 + MEMORY_MINUTES + 1), null, 'forgotten after a game day');

    rememberTold(bartender, alice, `Listen. ${'blah '.repeat(200)}`, 300);
    const long = bartender.knowledge.heard.at(-1).text;
    assert.ok(long.length <= HEARD_MAX_LENGTH + 3 && long.endsWith('...'));

    for (let i = 0; i < HEARD_MAX + 5; i++) {
        rememberTold(bartender, alice, `Rumor number ${i}.`, 400 + i);
    }
    assert.equal(bartender.knowledge.heard.length, HEARD_MAX);
    assert.equal(recallHeard(bartender, 'rumor 0', 500), null, 'the oldest went first');
    assert.ok(recallHeard(bartender, `rumor ${HEARD_MAX + 4}`, 500));
}

// Asleep (hearing off at a post), the NPC takes nothing in and reacts as
// the post says
{
    const sleeper = {
        ...BARTENDER,
        routine: [
            {
                from: 0,
                roomId: 'test/town/saloon',
                senses: { sight: false, hearing: false },
                unknownTopic: { emote: 'snores.' },
            },
        ],
    };
    const { bartender, alice } = setUp(sleeper);
    assert.deepEqual(hearTold(bartender, alice, 'Wake up.', { hour: 3, now: 10 }), { emote: 'snores.' });
    assert.deepEqual(bartender.knowledge.heard, []);
}

// Awake at a post with its own dialogue: hearing decides, not the dialogue,
// so it remembers, and reacts with the post's unknownTopic
{
    const counting = {
        ...BARTENDER,
        routine: [{ from: 0, roomId: 'test/town/saloon', unknownTopic: { emote: 'keeps counting coins.' } }],
    };
    const { bartender, alice } = setUp(counting);
    assert.deepEqual(hearTold(bartender, alice, 'The stage is late.', { hour: 3, now: 10 }), {
        emote: 'keeps counting coins.',
    });
    assert.equal(bartender.knowledge.heard.length, 1);
}

// Saved and loaded with the rest of the store, minus anything too old
{
    const { bartender, alice } = setUp();
    const dir = path.join(tmp, 'npcs');
    rememberTold(bartender, alice, 'The stage is late.', 1000);
    saveNpcKnowledge({ npcs: [bartender] }, dir, 1000);
    const fresh = new Npc(BARTENDER, 'test/town/saloon');
    loadNpcKnowledge({ npcs: [fresh] }, dir, 1100);
    assert.equal(recallHeard(fresh, 'stage', 1100).by.seenAs, 'a bearded man');
    const later = new Npc(BARTENDER, 'test/town/saloon');
    loadNpcKnowledge({ npcs: [later] }, dir, 1000 + MEMORY_MINUTES + 1);
    assert.deepEqual(later.knowledge.heard, []);
}

// A malformed toldReply fails at startup
{
    assert.throws(() => validateDialogue({ toldReply: { says: '' } }, 'test/town/npc'), /"toldReply" needs a "says"/);
    assert.doesNotThrow(() => validateDialogue({ toldReply: { emote: 'nods.' } }, 'test/town/npc'));
}

fs.rmSync(tmp, { recursive: true, force: true });
