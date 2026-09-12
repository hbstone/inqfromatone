import assert from 'assert/strict';
import { renderColors, stripColors, capitalizeFirst } from '../modules/color.js';

// {rgb} cube codes map onto the real xterm 256-color cube:
// index = 16 + 36r + 6g + b - so {500} is index 196, {050} is 46, etc.
{
    assert.equal(renderColors('{500red'), '\x1b[38;5;196mred\x1b[0m');
    assert.equal(renderColors('{050green'), '\x1b[38;5;46mgreen\x1b[0m');
    assert.equal(renderColors('{005blue'), '\x1b[38;5;21mblue\x1b[0m');
    assert.equal(renderColors('{555white'), '\x1b[38;5;231mwhite\x1b[0m');
}

// A trailing "}" is tolerated (and consumed) as well as a bare token, so
// either authoring habit works identically
{
    assert.equal(renderColors('{500}red'), renderColors('{500red'));
}

// Single-letter aliases resolve to the same cube formula; case carries
// bright vs dark, not a separate "bold" code
{
    assert.equal(renderColors('{Rred'), '\x1b[38;5;196mred\x1b[0m'); // R -> [5,0,0]
    assert.equal(renderColors('{Kblack'), renderColors('{kblack'), 'K and k both resolve to the same dark grey');
}

// Style letters: u/U underline, x/X reset - independent of the color codes
{
    assert.equal(renderColors('{uunderlined'), '\x1b[4munderlined\x1b[0m');
    assert.equal(renderColors('plain{xreset'), 'plain\x1b[0mreset\x1b[0m');
}

// A trailing reset is appended only when a token was actually used - a
// plain string with no color in it round-trips completely unchanged
{
    assert.equal(renderColors('nothing to see here'), 'nothing to see here');
}

// An unrecognized "{" (not a valid 3-digit or 1-letter payload) is left
// alone as literal text, not eaten
{
    assert.equal(renderColors('{abc} and {9 and {'), '{abc} and {9 and {');
}

// stripColors removes tokens (both bare and trailing-brace forms) without
// touching anything else, and never throws on malformed-looking input
{
    assert.equal(stripColors('{500Room Name{x'), 'Room Name');
    assert.equal(stripColors('{500}Room Name{x}'), 'Room Name');
    assert.equal(stripColors('no color here'), 'no color here');
    assert.doesNotThrow(() => stripColors('{ { {500 {zzz'));
}

// capitalizeFirst skips past any leading tokens to capitalize the first
// real letter, instead of mangling the token itself
{
    assert.equal(capitalizeFirst('hello'), 'Hello');
    assert.equal(capitalizeFirst('{Cyour room{x'), '{CYour room{x');
    assert.equal(capitalizeFirst('{500}{utext'), '{500}{uText', 'multiple leading tokens are all skipped');
}

console.log('All tests passed');
