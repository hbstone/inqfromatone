import assert from 'assert/strict';
import { on, emit } from '../modules/events.js';

// emit with no listeners registered should be a silent no-op
assert.doesNotThrow(() => emit('nothingListening', { foo: 'bar' }));

// multiple listeners on the same event should all fire, in registration order
const calls = [];
on('testEvent', (payload) => calls.push(['first', payload]));
on('testEvent', (payload) => calls.push(['second', payload]));
emit('testEvent', { value: 42 });
assert.deepStrictEqual(calls, [
    ['first', { value: 42 }],
    ['second', { value: 42 }],
], 'both listeners should fire, in registration order, with the same payload');

// a listener that throws should be logged and skipped, not stop sibling listeners
const order = [];
on('faultyEvent', () => {
    order.push('before-throw');
    throw new Error('listener boom');
});
on('faultyEvent', () => order.push('after-throw'));

const originalConsoleError = console.error;
let loggedError = false;
console.error = () => { loggedError = true; };
try {
    assert.doesNotThrow(() => emit('faultyEvent', {}));
} finally {
    console.error = originalConsoleError;
}

assert.deepStrictEqual(order, ['before-throw', 'after-throw'], 'a throwing listener should not block the next listener');
assert.ok(loggedError, 'a throwing listener should be logged');

console.log('All tests passed');
