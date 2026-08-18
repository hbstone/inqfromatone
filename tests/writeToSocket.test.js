import assert from 'assert/strict';
import { writeToSocket } from '../modules/utils.js';

function captureWrite() {
    let written = '';
    const socket = { write: (data) => { written += data; } };
    return { socket, get: () => written };
}

// A single-line message gets a trailing CRLF, not a bare LF - a raw/telnet
// terminal (e.g. PuTTY) needs the CR to return to column 0
{
    const { socket, get } = captureWrite();
    writeToSocket(socket, 'hello');
    assert.equal(get(), 'Hello\r\n');
}

// Internal newlines (multi-line messages like a room description) are
// normalized to CRLF too, not just the trailing one
{
    const { socket, get } = captureWrite();
    writeToSocket(socket, 'first line\nsecond line');
    assert.equal(get(), 'First line\r\nsecond line\r\n');
}

console.log('All tests passed');
