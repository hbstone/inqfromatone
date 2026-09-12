import assert from 'assert/strict';
import { Character } from '../modules/Character.js';
import { color } from '../modules/commands/color.js';

// Defaults to on, and no-arg reports the current state without changing it
{
    const character = new Character('Alice');
    assert.equal(character.colorEnabled, true);
    assert.equal(color(null, [], character), 'Color is currently on.');
    assert.equal(character.colorEnabled, true);
}

// "color off"/"color on" set the preference and confirm the change
{
    const character = new Character('Alice');

    assert.equal(color(null, ['off'], character), 'Color is now off.');
    assert.equal(character.colorEnabled, false);
    assert.equal(color(null, [], character), 'Color is currently off.');

    assert.equal(color(null, ['on'], character), 'Color is now on.');
    assert.equal(character.colorEnabled, true);
}

// Case-insensitive, and an unrecognized argument doesn't change anything
{
    const character = new Character('Alice');

    assert.equal(color(null, ['OFF'], character), 'Color is now off.');
    assert.equal(character.colorEnabled, false);

    assert.equal(color(null, ['purple'], character), 'Usage: color [on|off]');
    assert.equal(character.colorEnabled, false, 'an invalid argument leaves the preference untouched');
}

console.log('All tests passed');
