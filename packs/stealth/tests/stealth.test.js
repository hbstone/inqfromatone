import assert from 'assert/strict';
import { World } from '../../../modules/World.js';
import { Npc } from '../../../modules/Npc.js';
import { Item } from '../../../modules/Item.js';
import { movePlayer } from '../../../modules/commands/move.js';
import { give } from '../../../modules/commands/give.js';
import { get } from '../../../modules/commands/get.js';
import { clearNoticeRule, registerNoticeRule } from '../../../modules/notice.js';
import { promptStatusesFor } from '../../../modules/promptStatus.js';
import { recallSighting, sightingAnswer, watchForSightings } from '../../../modules/npcs/knowledge.js';
import { makeNoticeRule, isSneaking } from '../lib/sneaking.js';
import setup, { sneak } from '../index.js';
import { makeCharacter, lastMessage } from '../../../tests/helpers.js';

watchForSightings();

// Rolls in order, for a rule that's predictable
const rolls = (...values) => {
    const queue = [...values];
    return () => queue.shift();
};

// hall (north) <-> yard (south); Alice moves, Bob, Cara and the porter watch
function setUp() {
    const world = new World();
    world.addRoom('Hall', 'A hall.', 'test/house/hall');
    world.addRoom('Yard', 'A yard.', 'test/house/yard');
    const hall = world.getRoomById('test/house/hall');
    const yard = world.getRoomById('test/house/yard');
    hall.exits = { south: 'test/house/yard' };
    yard.exits = { north: 'test/house/hall' };
    const alice = makeCharacter('Alice');
    const bob = makeCharacter('Bob');
    const cara = makeCharacter('Cara');
    const porter = new Npc({ id: 'test/house/porter', name: 'a porter', sightings: true }, hall.id);
    yard.addCharacter(alice);
    for (const c of [bob, cara, porter]) {
        hall.addCharacter(c);
    }
    return { world, hall, yard, alice, bob, cara, porter };
}

// The toggle: on, off, persists in components (so it's saved), shows in the
// prompt
{
    const alice = makeCharacter('Alice');
    alice.isLoggedIn = true;
    const pack = {
        registerCommand() {},
        registerNoticeRule() {},
        registerPromptStatus: (status) => statuses.push(status),
    };
    const statuses = [];
    setup(pack);
    assert.equal(statuses[0](alice), null);
    assert.equal(sneak(null, [], alice), 'You start moving quietly, trying not to draw notice.');
    assert.deepEqual(alice.components.stealth, { sneaking: true });
    assert.equal(statuses[0](alice), 'sneaking');
    assert.equal(sneak(null, ['on'], alice), "You're already sneaking.");
    assert.equal(sneak(null, ['off'], alice), 'You stop sneaking and move about openly again.');
    assert.deepEqual(alice.components, {});
    assert.equal(sneak(null, ['maybe'], alice), 'Usage: sneak, or sneak on / sneak off');
    assert.ok(Array.isArray(promptStatusesFor(alice)));
}

// Not sneaking: everyone notices, nothing rolled
{
    const { world, yard, alice, bob } = setUp();
    registerNoticeRule(makeNoticeRule(rolls()));
    try {
        movePlayer(world, alice, yard, 'north', 'south');
        assert.equal(lastMessage(bob), 'Alice arrives from the south.');
    } finally {
        clearNoticeRule();
    }
}

// Sneaking: each observer rolls for themselves. Bob misses it (under 0.5),
// Cara catches her at it (0.5-0.75), the porter sees it as usual (0.75+)
// and remembers; nobody's told who spotted whom
{
    const { world, hall, yard, alice, bob, cara, porter } = setUp();
    sneak(null, ['on'], alice);
    registerNoticeRule(makeNoticeRule(rolls(0.1, 0.6, 0.9)));
    try {
        const before = bob.socket.messages.length;
        const result = movePlayer(world, alice, yard, 'north', 'south');
        assert.equal(bob.socket.messages.length, before, 'Bob missed it');
        assert.equal(lastMessage(cara), 'Alice arrives from the south. They appear to be trying to avoid notice.');
        assert.ok(recallSighting(porter, 'alice'), 'the porter noticed');
        assert.doesNotMatch(result, /notice/i, "the sneaker isn't told");

        // An NPC that missed it remembers nothing; one that caught her at it
        // says so
        registerNoticeRule(makeNoticeRule(rolls(0.6, 0.6, 0.6)), { override: true });
        movePlayer(world, alice, hall, 'south', 'north');
        assert.match(
            sightingAnswer(recallSighting(porter, 'alice'), hall).says,
            /headed south\. Seemed to be trying not to be noticed, too\.$/,
        );
    } finally {
        clearNoticeRule();
    }
}

// Handing something over or picking it up rolls the same way; the
// recipient can miss being handed something
{
    const { world, hall, alice, bob, cara } = setUp();
    hall.addCharacter(alice);
    alice.inventory.push(new Item('a note', 'A folded note.', ['note']));
    hall.inventory.push(new Item('a dagger', 'A thin dagger.', ['dagger']));
    sneak(null, ['on'], alice);
    // give: one roll per observer (Bob is the recipient, then Cara, then the porter)
    registerNoticeRule(makeNoticeRule(rolls(0.1, 0.9, 0.1)));
    try {
        const bobBefore = bob.socket.messages.length;
        assert.equal(give(world, ['note', 'bob'], alice), 'You give a note to Bob.');
        assert.equal(bob.socket.messages.length, bobBefore, 'planted without Bob noticing');
        assert.equal(lastMessage(cara), 'Alice gives a note to Bob.');
        assert.equal(bob.inventory.length, 1);

        registerNoticeRule(makeNoticeRule(rolls(0.9, 0.6, 0.1)), { override: true });
        assert.equal(get(world, ['dagger'], alice), 'You pick up a dagger.');
        assert.equal(lastMessage(bob), 'Alice picks up a dagger.');
        assert.equal(lastMessage(cara), 'Alice picks up a dagger. They appear to be trying to avoid notice.');
    } finally {
        clearNoticeRule();
    }
}

// NPCs sneak from content: always, or some of the time
{
    const thief = new Npc({ id: 't/t/thief', name: 'a thief', components: { stealth: { sneaking: true } } }, 'x');
    const cat = new Npc({ id: 't/t/cat', name: 'a cat', components: { stealth: { sneakChance: 0.3 } } }, 'x');
    assert.equal(isSneaking(thief, rolls()), true);
    assert.equal(isSneaking(cat, rolls(0.2)), true);
    assert.equal(isSneaking(cat, rolls(0.4)), false);
    assert.equal(isSneaking(makeCharacter('Dan'), rolls()), false);
}
