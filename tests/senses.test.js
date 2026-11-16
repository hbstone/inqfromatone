import assert from 'assert/strict';
import { Npc } from '../modules/Npc.js';
import { canSense, registerSenseLayer, SENSES, validateSenses } from '../modules/senses.js';
import '../modules/npcs/routine.js'; // registers the routine-post sense layer
import { makeCharacter } from './helpers.js';

// Every sense is on unless content switches it off; a post overrides the
// NPC per sense, and only while the NPC is at it
{
    const npc = new Npc(
        {
            id: 'test/town/beggar',
            name: 'a blind beggar',
            senses: { sight: false },
            routine: [{ from: 21, roomId: 'test/town/alley', senses: { hearing: false } }],
        },
        'test/town/street',
    );
    npc.roomId = 'test/town/street';
    assert.equal(canSense(npc, 'sight', 12), false);
    assert.equal(canSense(npc, 'hearing', 12), true);
    assert.equal(canSense(npc, 'smell', 12), true);

    assert.equal(canSense(npc, 'hearing', 22), true, 'not at its post yet');
    npc.roomId = 'test/town/alley';
    assert.equal(canSense(npc, 'hearing', 22), false, 'asleep at its post');
    assert.equal(canSense(npc, 'sight', 22), false, 'still blind: the post only says hearing');
    assert.equal(canSense(npc, 'smell', 22), true, 'still smells smoke');

    const alice = makeCharacter('Alice');
    assert.equal(canSense(alice, 'sight'), true, 'players have every sense by default');
    alice.senses = { hearing: false };
    assert.equal(canSense(alice, 'hearing'), false, 'and use the same check');
}

// Content is checked: known senses, booleans
{
    assert.deepEqual(SENSES, ['sight', 'hearing', 'smell']);
    assert.doesNotThrow(() => validateSenses(undefined, 'x'));
    assert.doesNotThrow(() => validateSenses({ sight: false, smell: true }, 'x'));
    assert.throws(() => validateSenses({ smel: false }, 'NPC "a"'), /NPC "a": unknown sense "smel"/);
    assert.throws(() => validateSenses({ sight: 'no' }, 'x'), /must be true or false/);
    assert.throws(() => validateSenses(['sight'], 'x'), /must be an object/);
}

// A layer (a player asleep, say) overrides per sense, for anyone
{
    const bob = makeCharacter('Bob');
    registerSenseLayer((character) => (character.asleep ? { sight: false, hearing: false } : null));
    assert.equal(canSense(bob, 'sight'), true);
    bob.asleep = true;
    assert.equal(canSense(bob, 'sight'), false);
    assert.equal(canSense(bob, 'smell'), true, 'smell still gets through');
}
