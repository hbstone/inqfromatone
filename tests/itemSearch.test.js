import assert from 'assert/strict';
import { Item } from '../modules/Item.js';
import { resolveItemToken, formatItemList, itemDisplayName, previewMatch } from '../modules/itemSearch.js';

function makeItem(name, keywords, weight = 1) {
    return new Item(name, `${name}.`, keywords, { size: 'small', weight });
}

function makeStack(name, keywords, quantity, weight = 1) {
    return new Item(name, `${name}.`, keywords, { size: 'small', weight, stackable: true, quantity });
}

// Plain keyword (no qualifier): first match, in source-list order -
// unchanged from the pre-qualifier behavior
{
    const inventory = [makeItem('a pouch', ['pouch'])];
    const room = [makeItem('a rusty key', ['rusty', 'key'])];

    const result = resolveItemToken('key', [inventory, room]);
    assert.equal(result.error, null);
    assert.equal(result.matches.length, 1);
    assert.equal(result.matches[0].item.name, 'a rusty key');
    assert.equal(result.matches[0].source, room, 'should report which array it was found in');
}

// Plain keyword, no match: empty matches, no error - callers keep their
// own "you don't see that" wording for this case
{
    const result = resolveItemToken('nonexistent', [[], []]);
    assert.deepStrictEqual(result, { matches: [], error: null });
}

// Ordinal (2.keyword): the 2nd match, across sources in priority order
{
    const inventory = [makeItem('a pouch (held)', ['pouch'])];
    const room = [makeItem('a pouch (floor 1)', ['pouch']), makeItem('a pouch (floor 2)', ['pouch'])];

    const result = resolveItemToken('2.pouch', [inventory, room]);
    assert.equal(result.error, null);
    assert.equal(result.matches.length, 1);
    assert.equal(result.matches[0].item.name, 'a pouch (floor 1)', 'inventory match is #1, so #2 is the first floor one');
}

// Ordinal asking for more than exist: fails the whole thing, exact
// wording the request specified
{
    const room = [makeItem('a pouch', ['pouch'])];
    const result = resolveItemToken('2.pouch', [[], room]);
    assert.deepStrictEqual(result, { matches: [], error: 'There aren\'t 2 things matching "pouch" here.' });
}

// Cardinal (N*keyword): the first N matches, across sources in order
{
    const inventory = [makeItem('a brick (held)', ['brick'])];
    const room = [makeItem('a brick (floor 1)', ['brick']), makeItem('a brick (floor 2)', ['brick'])];

    const result = resolveItemToken('3*brick', [inventory, room]);
    assert.equal(result.error, null);
    assert.deepStrictEqual(result.matches.map(m => m.item.name), ['a brick (held)', 'a brick (floor 1)', 'a brick (floor 2)']);
    assert.equal(result.matches[0].source, inventory);
    assert.equal(result.matches[1].source, room, 'a cardinal match can span sources');
}

// Cardinal asking for more than exist: fails the whole thing
{
    const room = [makeItem('a brick', ['brick'])];
    const result = resolveItemToken('3*brick', [[], room]);
    assert.deepStrictEqual(result, { matches: [], error: 'There aren\'t 3 things matching "brick" here.' });
}

// Keyword matching is case-insensitive, same as the pre-qualifier code
{
    const room = [makeItem('a rusty key', ['rusty', 'key'])];
    assert.equal(resolveItemToken('KEY', [room]).matches.length, 1);
    assert.equal(resolveItemToken('2.KEY', [room]).error, 'There aren\'t 2 things matching "key" here.');
}

// Matching is fuzzy (substring), not exact - "bri" finds "brick", and it
// composes with qualifiers too
{
    const room = [makeItem('a 0.5 lb brick', ['brick', 'half']), makeItem('a pouch', ['pouch'])];
    assert.equal(resolveItemToken('bri', [room]).matches[0].item.name, 'a 0.5 lb brick');
    assert.equal(resolveItemToken('pou', [room]).matches[0].item.name, 'a pouch');
    assert.equal(resolveItemToken('2.bri', [room]).error, 'There aren\'t 2 things matching "bri" here.');
}

// formatItemList: single item is just its name
{
    assert.equal(formatItemList([makeItem('a rusty key', ['key'])]), 'a rusty key');
}

// formatItemList: identical names group under one "xN", not pluralized
{
    const bricks = [makeItem('a 0.5 lb brick', ['brick']), makeItem('a 0.5 lb brick', ['brick']), makeItem('a 0.5 lb brick', ['brick'])];
    assert.equal(formatItemList(bricks), 'a 0.5 lb brick (x3)');
}

// formatItemList: two distinct names join with "and"
{
    const items = [makeItem('a 0.5 lb brick', ['brick']), makeItem('a 1 lb brick', ['brick'])];
    assert.equal(formatItemList(items), 'a 0.5 lb brick and a 1 lb brick');
}

// formatItemList: a heterogeneous cardinal match groups each distinct
// name with its own count, in first-seen order, oxford-comma joined
{
    const items = [
        makeItem('a 0.5 lb brick', ['brick']),
        makeItem('a 0.5 lb brick', ['brick']),
        makeItem('a 1 lb brick', ['brick']),
        makeItem('a pouch', ['pouch']),
    ];
    assert.equal(formatItemList(items), 'a 0.5 lb brick (x2), a 1 lb brick, and a pouch');
}

// itemDisplayName: plain name for a singleton, "(xN)" suffix for a stack
{
    const single = makeItem('an arrow', ['arrow']);
    assert.equal(itemDisplayName(single), 'an arrow');

    const stack = makeItem('an arrow', ['arrow']);
    stack.quantity = 20;
    assert.equal(itemDisplayName(stack), 'an arrow (x20)');
}

// formatItemList: a single stacked object's own quantity counts toward
// its "(xN)" total, same as several separate objects would
{
    const stack = makeItem('an arrow', ['arrow']);
    stack.quantity = 20;
    assert.equal(formatItemList([stack]), 'an arrow (x20)');
}

// Cardinal against a stack: counts *units*, not objects - 10*arrow
// against one 20-arrow stack claims part of that single object, rather
// than failing for "only 1 matching object"
{
    const stack = makeStack('an arrow', ['arrow'], 20, 0.05);
    const result = resolveItemToken('10*arrow', [[stack]]);

    assert.equal(result.error, null);
    assert.equal(result.matches.length, 1, 'still just the one object - it just claims part of it');
    assert.equal(result.matches[0].item, stack, 'the underlying object is unchanged - no split has happened yet');
    assert.equal(result.matches[0].quantity, 10, 'but the claim is only 10 of its 20');
    assert.equal(stack.quantity, 20, 'resolveItemToken is read-only - nothing is split until a command commits');
}

// Cardinal that exactly matches a stack's whole quantity: a full claim,
// not a partial one
{
    const stack = makeStack('an arrow', ['arrow'], 20, 0.05);
    const result = resolveItemToken('20*arrow', [[stack]]);
    assert.equal(result.matches[0].quantity, 20);
}

// Cardinal exceeding a stack's total: fails the whole thing, same as
// exceeding an object count always has
{
    const stack = makeStack('an arrow', ['arrow'], 20, 0.05);
    const result = resolveItemToken('25*arrow', [[stack]]);
    assert.deepStrictEqual(result, { matches: [], error: 'There aren\'t 25 things matching "arrow" here.' });
}

// Cardinal can span a partially-claimed stack plus other matches, same
// spanning-sources behavior as the object-counting case above
{
    const heldStack = makeStack('an arrow', ['arrow'], 5, 0.05);
    const floorStack = makeStack('an arrow', ['arrow'], 20, 0.05);
    const result = resolveItemToken('12*arrow', [[heldStack], [floorStack]]);

    assert.equal(result.error, null);
    assert.deepStrictEqual(result.matches.map(m => m.quantity), [5, 7], 'takes the held stack whole, then 7 of the floor stack');
    assert.equal(result.matches[0].item, heldStack);
    assert.equal(result.matches[1].item, floorStack);
}

// previewMatch: a full claim (plain keyword, ordinal, or an evenly-
// dividing cardinal) returns the object itself, unchanged - identity
// matters here, since containers.js's self/cycle checks rely on it
{
    const stack = makeStack('an arrow', ['arrow'], 20, 0.05);
    const match = resolveItemToken('20*arrow', [[stack]]).matches[0];
    assert.equal(previewMatch(match), stack);
}

// previewMatch: a partial cardinal claim returns a read-only stand-in
// carrying just the claimed quantity, without touching the real object
{
    const stack = makeStack('an arrow', ['arrow'], 20, 0.05);
    const match = resolveItemToken('10*arrow', [[stack]]).matches[0];

    const preview = previewMatch(match);
    assert.notEqual(preview, stack, 'should not be the real object');
    assert.equal(preview.quantity, 10);
    assert.equal(preview.name, 'an arrow');
    assert.equal(stack.quantity, 20, 'the real stack must be untouched');
}

console.log('All tests passed');
