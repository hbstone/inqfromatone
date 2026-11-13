import assert from 'assert/strict';
import { mock } from 'node:test';
import { guard } from '../modules/guard.js';

// Silence the expected error logs from the throwing cases below
mock.method(console, 'error', () => {});

// guard returns fn's result, or the fallback (logged) if it throws
{
    assert.equal(
        guard('ok', () => 42),
        42,
    );
    assert.equal(
        guard(
            'boom',
            () => {
                throw new Error('boom');
            },
            'fallback',
        ),
        'fallback',
    );
    assert.equal(
        guard('boom', () => {
            throw new Error('boom');
        }),
        undefined,
    );
    assert.equal(console.error.mock.callCount(), 2);
}

console.log('All tests passed');
