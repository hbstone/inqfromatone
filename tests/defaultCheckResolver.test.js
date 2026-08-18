import assert from 'assert/strict';
import '../modules/checks/index.js'; // registers the default resolver, see checks/index.js
import { resolveCheck } from '../modules/checks/registry.js';
import { initStat } from '../modules/stats.js';

// Kept in its own file: importing checks/index.js registers a resolver as
// a side effect, which would break checks.test.js's "no resolver
// registered yet" case if they shared a process/module cache.

function withMockedRandom(value, fn) {
    const original = Math.random;
    Math.random = () => value;
    try {
        return fn();
    } finally {
        Math.random = original;
    }
}

const character = { components: {} };
initStat(character, 'strength', 10);

// The resolver nudges the attacker's value by -1/0/+1 before comparing
// (see checks/index.js) - difficulties far enough from the base value are
// deterministic regardless of which nudge lands.
assert.equal(resolveCheck(character, 'strength', { difficulty: 8 }), true, 'value comfortably above difficulty should always succeed');
assert.equal(resolveCheck(character, 'strength', { difficulty: 12 }), false, 'value comfortably below difficulty should always fail');
assert.equal(resolveCheck(character, 'strength'), true, 'a missing difficulty defaults to 0, always succeeds');

// At the boundary (difficulty === value), the three possible nudges are
// exercised directly by mocking Math.random, rather than relying on many
// trials landing statistically close to 2/3.
assert.equal(
    withMockedRandom(0, () => resolveCheck(character, 'strength', { difficulty: 10 })),
    false,
    'a -1 nudge (Math.random() near 0) takes the value below difficulty - miss'
);
assert.equal(
    withMockedRandom(0.5, () => resolveCheck(character, 'strength', { difficulty: 10 })),
    true,
    'a 0 nudge (Math.random() near the middle) meets difficulty exactly - hit'
);
assert.equal(
    withMockedRandom(0.99, () => resolveCheck(character, 'strength', { difficulty: 10 })),
    true,
    'a +1 nudge (Math.random() near 1) beats difficulty - hit'
);

console.log('All tests passed');
