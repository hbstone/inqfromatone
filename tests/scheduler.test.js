import assert from 'assert/strict';
import { mock } from 'node:test';
import { every, after, advance, reset } from '../modules/scheduler.js';

mock.method(console, 'error', () => {}); // expected logs from the throwing job below

// `every` runs once per interval, starting one interval from now
{
    reset();
    let runs = 0;
    every('counter', 1000, () => runs++);
    advance(999);
    assert.equal(runs, 0);
    advance(1);
    assert.equal(runs, 1);
    advance(3000);
    assert.equal(runs, 4, 'one run per interval, even across a single big advance');
}

// `after` runs once; cancel stops a job before it runs
{
    reset();
    const ran = [];
    after('once', 500, () => ran.push('once'));
    const cancelled = after('never', 500, () => ran.push('never'));
    cancelled.cancel();
    advance(2000);
    assert.deepEqual(ran, ['once']);
}

// Jobs run in due-time order within one advance, whatever order they were
// added; jobs due at the same moment run in the order they were added
{
    reset();
    const order = [];
    every('slow', 300, () => order.push('slow'));
    every('fast', 200, () => order.push('fast'));
    advance(600);
    assert.deepEqual(order, ['fast', 'slow', 'fast', 'slow', 'fast']);
}

// A job can schedule or cancel others mid-advance
{
    reset();
    const order = [];
    let victim = null;
    after('spawner', 100, () => {
        order.push('spawner');
        after('child', 100, () => order.push('child'));
        victim.cancel();
    });
    victim = after('victim', 150, () => order.push('victim'));
    advance(500);
    assert.deepEqual(order, ['spawner', 'child']);
}

// A throwing job is logged and keeps its schedule; others still run
{
    reset();
    let flaky = 0;
    let steady = 0;
    every('flaky', 100, () => { flaky++; throw new Error('boom'); });
    every('steady', 100, () => steady++);
    advance(300);
    assert.equal(flaky, 3);
    assert.equal(steady, 3);
    assert.ok(console.error.mock.callCount() >= 3);
}

// Non-positive delays are rejected (they'd never let time move on)
{
    reset();
    assert.throws(() => every('bad', 0, () => {}), /positive delay/);
    assert.throws(() => after('bad', -5, () => {}), /positive delay/);
}

reset();
console.log('All tests passed');
