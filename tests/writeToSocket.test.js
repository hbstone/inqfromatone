import assert from 'assert/strict';
import { writeToSocket } from '../modules/utils.js';

function captureWrite() {
    let written = '';
    const socket = { write: (data) => { written += data; } };
    return { socket, get: () => written };
}

// A single-line message gets a leading blank line (so it reads as a
// separate block from whatever was on screen before it) and a trailing
// CRLF, not a bare LF - a raw/telnet terminal (e.g. PuTTY) needs the CR
// to return to column 0
{
    const { socket, get } = captureWrite();
    writeToSocket(socket, 'hello');
    assert.equal(get(), '\r\nHello\r\n');
}

// Internal newlines (multi-line messages like a room description) are
// normalized to CRLF too, not just the leading/trailing ones
{
    const { socket, get } = captureWrite();
    writeToSocket(socket, 'first line\nsecond line');
    assert.equal(get(), '\r\nFirst line\r\nsecond line\r\n');
}

// A color token is rendered to real ANSI by default (no socket.character
// at all, e.g. pre-login, defaults to color on same as everyone else) -
// and capitalization lands on the first real letter, not the token
{
    const { socket, get } = captureWrite();
    writeToSocket(socket, '{Ccyan room');
    assert.equal(get(), '\r\n\x1b[38;5;51mCyan room\x1b[0m\r\n');
}

// A character with color off gets the token stripped instead of rendered
{
    const { socket, get } = captureWrite();
    socket.character = { colorEnabled: false };
    writeToSocket(socket, '{Ccyan room');
    assert.equal(get(), '\r\nCyan room\r\n');
}

console.log('All tests passed');
