import assert from 'assert/strict';
import { keywordMatches } from '../modules/keywordMatch.js';

// An exact match still works, same as the old .includes(keyword) check
{
    assert.equal(keywordMatches(['brick', 'half'], 'brick'), true);
}

// A substring anywhere in a keyword matches, not just a prefix
{
    assert.equal(keywordMatches(['brick'], 'bri'), true, 'prefix substring');
    assert.equal(keywordMatches(['brick'], 'ick'), true, 'suffix substring');
    assert.equal(keywordMatches(['brick'], 'ric'), true, 'middle substring');
}

// No minimum length - even a single character matches
{
    assert.equal(keywordMatches(['brick'], 'b'), true);
    assert.equal(keywordMatches(['pouch'], 'p'), true);
}

// A keyword that doesn't contain the token at all doesn't match
{
    assert.equal(keywordMatches(['brick', 'half'], 'pouch'), false);
}

// Case-insensitive regardless of the token's casing (keywords are always
// stored lowercase already)
{
    assert.equal(keywordMatches(['brick'], 'BRI'), true);
    assert.equal(keywordMatches(['brick'], 'Brick'), true);
}

// Matches if *any* keyword in the list contains the token, not just the
// first one
{
    assert.equal(keywordMatches(['old', 'tom'], 'tom'), true);
    assert.equal(keywordMatches(['old', 'tom'], 'old'), true);
}

console.log('All tests passed');
