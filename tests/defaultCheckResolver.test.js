import assert from 'assert/strict';
import '../modules/checks/index.js'; // registers the default resolver, see checks/index.js
import { resolveCheck } from '../modules/checks/registry.js';
import { initStat } from '../modules/stats.js';

// Kept in its own file: importing checks/index.js registers a resolver as
// a side effect, which would break checks.test.js's "no resolver
// registered yet" case if they shared a process/module cache.

const character = { components: {} };
initStat(character, 'strength', 10);

assert.equal(resolveCheck(character, 'strength', { difficulty: 5 }), true, 'value >= difficulty should succeed');
assert.equal(resolveCheck(character, 'strength', { difficulty: 10 }), true, 'exactly meeting difficulty should succeed');
assert.equal(resolveCheck(character, 'strength', { difficulty: 11 }), false, 'value < difficulty should fail');
assert.equal(resolveCheck(character, 'strength'), true, 'a missing difficulty defaults to 0');

console.log('All tests passed');
