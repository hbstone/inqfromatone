import assert from 'assert/strict';
import { initStat, getStatValue, adjustBaseStat, setModifier, removeModifier } from '../modules/stats.js';

function makeCharacter() {
    return { components: {} };
}

// Basic init/read
{
    const character = makeCharacter();
    initStat(character, 'strength', 10);
    assert.equal(getStatValue(character, 'strength'), 10);
}

// Unknown stat reads as undefined, doesn't throw
{
    const character = makeCharacter();
    assert.equal(getStatValue(character, 'nope'), undefined);
}

// Permanent change via adjustBaseStat
{
    const character = makeCharacter();
    initStat(character, 'strength', 10);
    adjustBaseStat(character, 'strength', 2);
    assert.equal(getStatValue(character, 'strength'), 12);
}

// adjustBaseStat/setModifier/removeModifier on an unknown stat throws -
// these are caller errors, not missing-data cases like getStatValue
{
    const character = makeCharacter();
    assert.throws(() => adjustBaseStat(character, 'nope', 1));
    assert.throws(() => setModifier(character, 'nope', 'tag', 'add', 1));
}

// Tagged modifier changes the effective value without touching base
{
    const character = makeCharacter();
    initStat(character, 'strength', 10);
    setModifier(character, 'strength', 'blessed', 'add', 3);
    assert.equal(getStatValue(character, 'strength'), 13);
    assert.equal(character.components.stats.strength.base, 10, 'base should be untouched by a modifier');
}

// Re-setting the same tag replaces rather than stacking a duplicate
{
    const character = makeCharacter();
    initStat(character, 'strength', 10);
    setModifier(character, 'strength', 'blessed', 'add', 3);
    setModifier(character, 'strength', 'blessed', 'add', 5);
    assert.equal(character.components.stats.strength.modifiers.length, 1);
    assert.equal(getStatValue(character, 'strength'), 15);
}

// removeModifier removes it and the value reverts; a no-op on an unknown
// tag or unknown stat doesn't throw
{
    const character = makeCharacter();
    initStat(character, 'strength', 10);
    setModifier(character, 'strength', 'blessed', 'add', 3);
    removeModifier(character, 'strength', 'blessed');
    assert.equal(getStatValue(character, 'strength'), 10);
    assert.doesNotThrow(() => removeModifier(character, 'strength', 'not-a-real-tag'));
    assert.doesNotThrow(() => removeModifier(character, 'not-a-real-stat', 'blessed'));
}

// Multiple modifiers fold in insertion order: add(+5) then multiply(x2)
// on a base of 10 -> (10 + 5) * 2 = 30
{
    const character = makeCharacter();
    initStat(character, 'strength', 10);
    setModifier(character, 'strength', 'first', 'add', 5);
    setModifier(character, 'strength', 'second', 'multiply', 2);
    assert.equal(getStatValue(character, 'strength'), 30);
}

// Two independent stats on the same character don't interfere
{
    const character = makeCharacter();
    initStat(character, 'strength', 10);
    initStat(character, 'dexterity', 14);
    setModifier(character, 'strength', 'tag', 'add', 1);
    assert.equal(getStatValue(character, 'strength'), 11);
    assert.equal(getStatValue(character, 'dexterity'), 14);
}

console.log('All tests passed');
