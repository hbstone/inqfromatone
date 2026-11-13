import assert from 'assert/strict';
import { advance, reset } from '../modules/scheduler.js';
import {
    receiveInput,
    clearInput,
    MAX_LINE_LENGTH,
    COMMAND_GAP_MS,
    MAX_QUEUED_COMMANDS,
} from '../modules/inputQueue.js';

function connect({ loggedIn = true } = {}) {
    const socket = { written: [], ran: [] };
    socket.write = (msg) => socket.written.push(String(msg));
    socket.character = { isLoggedIn: loggedIn };
    return socket;
}

const run = (socket, line) => socket.ran.push(line);
const send = (socket, text) => receiveInput(socket, text, run);
const saw = (socket, pattern) => socket.written.some((m) => pattern.test(m));

// The first command runs at once; the rest wait COMMAND_GAP_MS each
{
    reset();
    const socket = connect();
    send(socket, 'look\nnorth\nsay hi\n');
    assert.deepEqual(socket.ran, ['look']);
    advance(COMMAND_GAP_MS - 1);
    assert.deepEqual(socket.ran, ['look'], 'not before the gap is up');
    advance(1);
    assert.deepEqual(socket.ran, ['look', 'north']);
    advance(COMMAND_GAP_MS);
    assert.deepEqual(socket.ran, ['look', 'north', 'say hi']);
}

// Typing after a pause runs immediately again; separately typed commands
// inside the gap still wait their turn
{
    reset();
    const socket = connect();
    send(socket, 'look\n');
    send(socket, 'north\n');
    assert.deepEqual(socket.ran, ['look'], 'second command, typed right away, waits');
    advance(COMMAND_GAP_MS * 4);
    assert.deepEqual(socket.ran, ['look', 'north']);
    send(socket, 'south\n');
    assert.deepEqual(socket.ran, ['look', 'north', 'south'], 'after a pause, runs at once');
}

// A line split across chunks is reassembled before it runs
{
    reset();
    const socket = connect();
    send(socket, 'lo');
    assert.deepEqual(socket.ran, []);
    send(socket, 'ok\r\n');
    assert.deepEqual(socket.ran, ['look']);
}

// Past MAX_QUEUED_COMMANDS waiting, extras are dropped with one notice
{
    reset();
    const socket = connect();
    const lines = Array.from({ length: MAX_QUEUED_COMMANDS + 10 }, (_, i) => `cmd${i}`);
    send(socket, lines.join('\n') + '\n');
    advance(COMMAND_GAP_MS * 100);
    // A whole paste is queued before the first line runs, so that's the cap
    assert.equal(socket.ran.length, MAX_QUEUED_COMMANDS);
    assert.deepEqual(socket.ran, lines.slice(0, MAX_QUEUED_COMMANDS), 'the first ones are kept, in order');
    assert.equal(socket.written.filter((m) => /faster than they can run/.test(m)).length, 1);
}

// Bare Enter in-game re-prompts without using a turn; at login it's queued
{
    reset();
    const socket = connect();
    send(socket, '\n');
    assert.deepEqual(socket.ran, []);
    assert.ok(saw(socket, /> $/), 're-prompted');
    send(socket, 'look\n');
    assert.deepEqual(socket.ran, ['look'], 'the blank line started no cooldown');

    const login = connect({ loggedIn: false });
    send(login, '\n');
    assert.deepEqual(login.ran, [''], 'login sees blank lines (to say "cannot be blank")');
}

// A complete over-long line is ignored with a notice
{
    reset();
    const socket = connect();
    send(socket, 'x'.repeat(MAX_LINE_LENGTH + 1) + '\nlook\n');
    assert.ok(saw(socket, /too long/));
    assert.deepEqual(socket.ran, ['look']);
}

// A line that never ends stops growing past the cap; its tail is skipped
// when the newline finally arrives, and input after that works normally
{
    reset();
    const socket = connect();
    send(socket, 'y'.repeat(MAX_LINE_LENGTH + 1));
    assert.equal(socket.lineBuffer, '', 'buffer dropped');
    send(socket, 'y'.repeat(MAX_LINE_LENGTH + 1));
    assert.equal(socket.written.filter((m) => /too long/.test(m)).length, 1, 'one notice per long line');
    send(socket, 'tail end\nlook\n');
    assert.deepEqual(socket.ran, ['look']);
}

// A closed connection runs nothing more, and clearInput drops what's pending
{
    reset();
    const socket = connect();
    send(socket, 'one\ntwo\nthree\n');
    clearInput(socket);
    socket.destroyed = true;
    advance(COMMAND_GAP_MS * 10);
    assert.deepEqual(socket.ran, ['one']);
}

reset();
console.log('All tests passed');
