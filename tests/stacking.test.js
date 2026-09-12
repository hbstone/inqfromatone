import assert from 'assert/strict';
import { Item } from '../modules/Item.js';
import { addItem, takeMatch, moveMatches } from '../modules/stacking.js';
import { resolveItemToken } from '../modules/itemSearch.js';

function makeArrow(quantity = 1) {
    return new Item('an arrow', 'A fletched arrow.', ['arrow'], { size: 'small', weight: 0.05, stackable: true, quantity });
}

function makeBrick() {
    return new Item('a brick', 'A brick.', ['brick'], { size: 'small', weight: 1 });
}

// addItem: a stackable item merges into a matching existing stack instead
// of appending a second entry
{
    const inventory = [makeArrow(5)];
    addItem(inventory, makeArrow(3));

    assert.equal(inventory.length, 1, 'should merge into the existing stack, not add a second object');
    assert.equal(inventory[0].quantity, 8);
}

// addItem: first arrival with nothing to merge into just gets pushed
{
    const inventory = [];
    addItem(inventory, makeArrow(5));

    assert.equal(inventory.length, 1);
    assert.equal(inventory[0].quantity, 5);
}

// addItem: non-stackable items never merge, even with the same name -
// existing content (bricks, etc.) keeps its "one object per unit" shape
{
    const inventory = [makeBrick()];
    addItem(inventory, makeBrick());

    assert.equal(inventory.length, 2, 'non-stackable items should never merge');
}

// addItem: different names don't merge even if both are stackable
{
    const inventory = [makeArrow(5)];
    const bolt = new Item('a bolt', 'A crossbow bolt.', ['bolt'], { size: 'small', weight: 0.05, stackable: true });
    addItem(inventory, bolt);

    assert.equal(inventory.length, 2);
}

// takeMatch: a full claim (quantity equal to the object's own) removes
// the object itself from its source, unchanged - same as before splitting
// existed
{
    const quiver = [makeArrow(20)];
    const original = quiver[0];
    const match = { item: original, source: quiver, quantity: 20 };

    const taken = takeMatch(match);
    assert.equal(taken, original);
    assert.equal(taken.quantity, 20);
    assert.deepStrictEqual(quiver, [], 'the whole object should be removed from its source');
}

// takeMatch: a partial claim splits - the original stays in its source
// with the remainder, and a brand-new object carries the claimed amount
{
    const original = makeArrow(20);
    const quiver = [original];
    const match = { item: original, source: quiver, quantity: 10 };

    const taken = takeMatch(match);
    assert.notEqual(taken, original, 'the split-off portion should be a new object');
    assert.equal(taken.quantity, 10);
    assert.equal(taken.name, 'an arrow');
    assert.equal(taken.stackable, true);
    assert.deepStrictEqual(quiver, [original], 'the original stays put, still in its source');
    assert.equal(original.quantity, 10, 'decremented by exactly what was claimed');
}

// moveMatches: end-to-end - resolving a cardinal token against a stack,
// then moving it, splits the stack and leaves the rest behind
{
    const quiver = [makeArrow(20)];
    const backpack = [];

    const { matches } = resolveItemToken('10*arrow', [quiver]);
    moveMatches(matches, backpack);

    assert.equal(quiver.length, 1, 'the quiver keeps the remainder as one object');
    assert.equal(quiver[0].quantity, 10);
    assert.equal(backpack.length, 1);
    assert.equal(backpack[0].quantity, 10);
    assert.notEqual(backpack[0], quiver[0], 'moved and left-behind portions are distinct objects');
}

// moveMatches: claiming a stack's entire quantity via cardinal moves the
// whole object rather than pointlessly splitting it into an equal piece
{
    const quiver = [makeArrow(20)];
    const backpack = [];

    const { matches } = resolveItemToken('20*arrow', [quiver]);
    moveMatches(matches, backpack);

    assert.deepStrictEqual(quiver, []);
    assert.equal(backpack.length, 1);
    assert.equal(backpack[0].quantity, 20);
}

// moveMatches: a 1*keyword claim peels off exactly one unit, leaving the
// rest of the stack behind
{
    const quiver = [makeArrow(20)];
    const backpack = [];

    const { matches } = resolveItemToken('1*arrow', [quiver]);
    moveMatches(matches, backpack);

    assert.equal(quiver[0].quantity, 19);
    assert.equal(backpack[0].quantity, 1);
}

// moveMatches: merges a split-off portion into a matching stack already
// present at the destination, same as addItem always has
{
    const quiver = [makeArrow(20)];
    const backpack = [makeArrow(5)];

    const { matches } = resolveItemToken('10*arrow', [quiver]);
    moveMatches(matches, backpack);

    assert.equal(backpack.length, 1, 'should merge into the existing backpack stack, not add a second object');
    assert.equal(backpack[0].quantity, 15);
}

console.log('All tests passed');
