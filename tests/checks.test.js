import assert from 'assert/strict';
import { registerCheckResolver, resolveCheck } from '../modules/checks/registry.js';
import { initStat } from '../modules/stats.js';

// No resolver registered yet - resolveCheck should fail loudly rather
// than silently succeed/fail
{
    const character = { components: {} };
    initStat(character, 'strength', 10);
    assert.throws(() => resolveCheck(character, 'strength', { difficulty: 5 }), /No check resolver registered/);
    assert.throws(() => registerCheckResolver(() => 1, { override: true }), /nothing registered one yet/);
}

// A registered resolver receives the character, statKey, the *effective*
// stat value (not the raw base), and the opaque context, and its return
// value passes straight through
{
    let received;
    registerCheckResolver((payload) => {
        received = payload;
        return 'resolver result';
    });

    const character = { components: {} };
    initStat(character, 'strength', 10);
    const result = resolveCheck(character, 'strength', { difficulty: 15 });

    assert.equal(result, 'resolver result');
    assert.equal(received.character, character);
    assert.equal(received.statKey, 'strength');
    assert.equal(received.value, 10);
    assert.deepStrictEqual(received.context, { difficulty: 15 });
}

// Only one at a time: registering again is an error unless it overrides
{
    assert.throws(() => registerCheckResolver(() => 'second'), /already registered \(pass \{ override: true \}/);
    registerCheckResolver(() => 'second', { override: true });

    const character = { components: {} };
    initStat(character, 'strength', 10);
    assert.equal(resolveCheck(character, 'strength'), 'second');
}

// context defaults to {} when omitted
{
    registerCheckResolver(({ context }) => context, { override: true });
    const character = { components: {} };
    initStat(character, 'strength', 10);
    assert.deepStrictEqual(resolveCheck(character, 'strength'), {});
}

console.log('All tests passed');
