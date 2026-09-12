import assert from 'assert/strict';
import { writePrompt } from '../modules/utils.js';

function captureWrite() {
    let written = '';
    const socket = { write: (data) => { written += data; } };
    return { socket, get: () => written };
}

// A blank line, then a bare "> " with no trailing newline - so the
// player's typed input lands right after it on the same line, not
// writeToSocket's usual capitalize-and-CRLF treatment
{
    const { socket, get } = captureWrite();
    writePrompt(socket);
    assert.equal(get(), '\r\n> ');
}

console.log('All tests passed');
