import assert from 'assert/strict';
import { mock } from 'node:test';
import { guard, guardedInterval } from '../modules/guard.js';

// Silence the expected error logs from the throwing cases below
mock.method(console, 'error', () => {});

// guard returns fn's result, or the fallback (logged) if it throws
{
    assert.equal(guard('ok', () => 42), 42);
    assert.equal(guard('boom', () => { throw new Error('boom'); }, 'fallback'), 'fallback');
    assert.equal(guard('boom', () => { throw new Error('boom'); }), undefined);
    assert.equal(console.error.mock.callCount(), 2);
}

// A throwing tick doesn't stop later ticks
{
    mock.timers.enable({ apis: ['setInterval'] });
    let ticks = 0;
    const handle = guardedInterval('flaky', () => {
        ticks++;
        throw new Error('tick failed');
    }, 1000);

    mock.timers.tick(3000);
    assert.equal(ticks, 3);

    clearInterval(handle);
    mock.timers.reset();
}

console.log('All tests passed');
