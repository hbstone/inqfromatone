import assert from 'assert/strict';
import { PROMPT_REDRAW_MS, writePrompt, writeToSocket } from '../modules/utils.js';
import { advance, reset } from '../modules/scheduler.js';

function captureWrite() {
    let written = '';
    const socket = {
        write: (data) => {
            written += data;
        },
    };
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

// Output the player didn't type for gets a fresh prompt on the next pulse:
// one for a burst of lines, not one each
{
    reset();
    const { socket, get } = captureWrite();
    writeToSocket(socket, 'Alice arrives from the south.');
    writeToSocket(socket, 'Baeron arrives from the south.');
    assert.equal(get(), '\r\nAlice arrives from the south.\r\n\r\nBaeron arrives from the south.\r\n', 'not yet');
    advance(PROMPT_REDRAW_MS);
    assert.ok(get().endsWith('Baeron arrives from the south.\r\n\r\n> '));
    assert.equal(get().match(/> /g).length, 1);

    // Later output, another prompt
    writeToSocket(socket, 'Alice says, "Hi."');
    advance(PROMPT_REDRAW_MS);
    assert.equal(get().match(/> /g).length, 2);
    reset();
}

// A command's own output already ends with a prompt, so no second one
{
    reset();
    const { socket, get } = captureWrite();
    writeToSocket(socket, 'You look around.');
    writePrompt(socket);
    advance(PROMPT_REDRAW_MS);
    assert.equal(get(), '\r\nYou look around.\r\n\r\n> ');
    reset();
}

// Nothing for a connection that's closed by the time it's due
{
    reset();
    const { socket, get } = captureWrite();
    writeToSocket(socket, 'Goodbye.');
    socket.writableEnded = true;
    advance(PROMPT_REDRAW_MS);
    assert.equal(get(), '\r\nGoodbye.\r\n');
    reset();
}

console.log('All tests passed');
