// Per-connection input limits (see ARCHITECTURE.md's "Input limits"):
//
//   - Line length cap. A line longer than MAX_LINE_LENGTH is thrown away
//     with a notice, not run. That includes a line that's still arriving:
//     once the not-yet-finished buffer passes the cap, it's dropped and the
//     rest of that line is skipped when its newline finally arrives, so a
//     client that never sends a newline can't grow memory forever.
//   - Command pacing. Lines go into a queue and run one at a time with at
//     least COMMAND_GAP_MS between them. The first command after a pause
//     runs immediately, so normal typing feels instant; a paste of ten
//     commands just plays out over five seconds instead of all at once.
//     The queue holds at most MAX_QUEUED_COMMANDS; anything past that is
//     dropped, with one notice per burst.
//
// The gap is timed with the scheduler, so it's honored to within one
// scheduler pulse.
import { extractLines, writeToSocket, writePrompt } from './utils.js';
import { after } from './scheduler.js';

// Long enough for a very wordy roleplay pose (~1,300 words).
export const MAX_LINE_LENGTH = 8 * 1024;
export const COMMAND_GAP_MS = 500;
// With a 0.5s gap, that's ten seconds of backlog.
export const MAX_QUEUED_COMMANDS = 20;

function isClosed(socket) {
    return Boolean(socket.destroyed || socket.writableEnded);
}

function notify(socket, message) {
    writeToSocket(socket, message);
    writePrompt(socket);
}

function tooLongNotice() {
    return `That line was too long (over ${MAX_LINE_LENGTH} characters) and was ignored.`;
}

function enqueue(socket, line) {
    const queue = socket.inputQueue;

    // A bare Enter in-game just re-prompts, and doesn't use up a turn.
    // While commands are still waiting it's ignored - the prompt comes
    // after them anyway. (During login it's queued like anything else,
    // so "Name cannot be blank" etc. still get said.)
    if (!line && socket.character.isLoggedIn) {
        if (queue.length === 0 && !socket.inputCooldown) {
            writePrompt(socket);
        }
        return;
    }

    if (queue.length >= MAX_QUEUED_COMMANDS) {
        if (!socket.inputOverflowNoticed) {
            socket.inputOverflowNoticed = true;
            notify(socket, "You're sending commands faster than they can run - the extras were dropped.");
        }
        return;
    }
    queue.push(line);
}

function drain(socket, runLine) {
    if (socket.inputCooldown || isClosed(socket)) {
        return;
    }
    const line = socket.inputQueue.shift();
    if (line === undefined) {
        socket.inputOverflowNoticed = false; // caught up; a later burst gets a fresh notice
        return;
    }

    runLine(socket, line);

    socket.inputCooldown = after('command gap', COMMAND_GAP_MS, () => {
        socket.inputCooldown = null;
        drain(socket, runLine);
    });
}

/**
 * Take a chunk of decoded input from a socket: split it into lines,
 * apply the length cap, queue what's left, and run the next command if
 * the connection isn't cooling down.
 * @param {import("net").Socket} socket
 * @param {string} chunk - Newly received text (Telnet negotiation already stripped).
 * @param {(socket: object, line: string) => void} runLine - Runs one line.
 */
export function receiveInput(socket, chunk, runLine) {
    socket.lineBuffer ??= '';
    socket.inputQueue ??= [];

    const { lines, remainder } = extractLines(socket.lineBuffer, chunk);
    socket.lineBuffer = remainder;

    for (const line of lines) {
        if (socket.discardingLine) {
            // The tail end of a line already reported as too long.
            socket.discardingLine = false;
            continue;
        }
        if (line.length > MAX_LINE_LENGTH) {
            notify(socket, tooLongNotice());
            continue;
        }
        enqueue(socket, line);
    }

    if (socket.lineBuffer.length > MAX_LINE_LENGTH) {
        socket.lineBuffer = '';
        if (!socket.discardingLine) {
            socket.discardingLine = true;
            notify(socket, tooLongNotice());
        }
    }

    drain(socket, runLine);
}

/**
 * Forget a closed connection's pending input and cooldown.
 * @param {import("net").Socket} socket
 */
export function clearInput(socket) {
    socket.inputCooldown?.cancel();
    socket.inputCooldown = null;
    socket.inputQueue = [];
}
