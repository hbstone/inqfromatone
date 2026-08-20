import assert from 'assert/strict';
import { Item } from '../modules/Item.js';
import { resolveItemToken, formatItemList } from '../modules/itemSearch.js';

function makeItem(name, keywords, weight = 1) {
    return new Item(name, `${name}.`, keywords, { size: 'small', weight });
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

console.log('All tests passed');
