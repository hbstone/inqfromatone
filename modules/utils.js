import { renderColors, stripColors, capitalizeFirst } from "./color.js";

// A character can turn color off (see modules/commands/color.js); a
// socket that hasn't reached a real character yet (pre-login) defaults to
// color on, same as everyone else.
function isColorEnabled(socket) {
  return socket.character?.colorEnabled !== false;
}

const IAC = 0xff; // Telnet "Interpret As Command" marker (RFC 854)
const SB = 0xfa; // Begin subnegotiation (e.g. NAWS window-size updates)
const SE = 0xf0; // End subnegotiation

/**
 * Strip Telnet option-negotiation sequences out of raw incoming bytes.
 * This server speaks plain text, not the Telnet protocol - it never
 * replies to a negotiation request - but clients connecting in Telnet
 * mode (PuTTY's default) send some regardless (WILL/DO for terminal type,
 * NAWS on connect and on every window resize, etc). Left unstripped, those
 * bytes land in whatever's typed next: often invisible to the user, but
 * enough to fail e.g. the character-name allowlist on the very first
 * login attempt. Must run on the raw Buffer, before any toString(): IAC
 * bytes (0xFF) aren't valid UTF-8 on their own, so decoding first would
 * mangle them into replacement characters instead of a recognizable
 * pattern to strip.
 *
 * Deliberately a strip-and-ignore filter, not a real Telnet implementation
 * - it doesn't negotiate anything back, and (like extractLines historically
 * did for \n) it assumes a negotiation sequence doesn't get split across
 * two "data" chunks. Both are fine for this project's real client mix; see
 * ARCHITECTURE.md's "Known gap" note for the same tradeoff made elsewhere.
 * @param {Buffer} data
 * @returns {Buffer}
 */
export function stripTelnetNegotiation(data) {
  const output = [];
  let i = 0;
  while (i < data.length) {
    if (data[i] !== IAC) {
      output.push(data[i]);
      i++;
      continue;
    }

    const command = data[i + 1];
    if (command === IAC) {
      output.push(IAC); // IAC IAC is an escaped literal 0xFF byte
      i += 2;
    } else if (command === SB) {
      // Subnegotiation: skip everything up to and including the closing IAC SE
      let j = i + 2;
      while (j < data.length - 1 && !(data[j] === IAC && data[j + 1] === SE)) {
        j++;
      }
      i = j + 2;
    } else if (command >= 0xfb && command <= 0xfe) {
      i += 3; // WILL/WONT/DO/DONT + one option byte
    } else {
      i += 2; // Other single-byte commands (NOP, GA, ...), or a truncated IAC at chunk end
    }
  }
  return Buffer.from(output);
}

/**
 * Split accumulated socket input into complete lines, keeping back any
 * trailing partial line for the next chunk. Needed because TCP makes no
 * guarantee that a line arrives in one piece: depending on the client (or
 * the network), a single line can arrive split across multiple packets,
 * or - as with Windows' telnet.exe talking to a server that does no
 * Telnet option negotiation - one keystroke per packet.
 * @param {string} buffer - Previously buffered, not-yet-complete input.
 * @param {string} chunk - Newly received data.
 * @returns {{ lines: string[], remainder: string }} Complete, trimmed
 *   lines ready to process, plus whatever's left over to buffer next time.
 */
export function extractLines(buffer, chunk) {
  const combined = buffer + chunk;
  const parts = combined.split("\n");
  const remainder = parts.pop(); // last part has no trailing \n yet - not complete
  return { lines: parts.map(line => line.trim()), remainder };
}

export function writeToSocket(socket, message) {
  // Capitalize before color-rendering, not after: renderColors turns a
  // leading token into raw ANSI escape bytes, which capitalizeFirst can no
  // longer recognize as "skip this, capitalize what's after it".
  const formattedMessage = capitalizeFirst(message);
  const colored = isColorEnabled(socket)
    ? renderColors(formattedMessage)
    : stripColors(formattedMessage);
  // CRLF, not bare LF: a raw/telnet-mode terminal (e.g. PuTTY) moves down a
  // line on LF but doesn't return to column 0 without an accompanying CR,
  // producing a "staircase" where each line starts where the last one
  // ended. Normalize any internal \n too (multi-line messages like the
  // room-description text build those directly), not just the trailing one.
  //
  // A leading blank line separates this from whatever was on screen before
  // it (the player's own typed input, a previous response, another
  // character's broadcast, ...) so output reads as a clearly separate
  // block - same idea as writePrompt's leading blank line before "> ".
  socket.write("\r\n" + colored.replace(/\n/g, "\r\n") + "\r\n");
}

/**
 * Write the "ready for input" prompt: a blank line to separate it from
 * whatever was just written (so it's visually obvious the output has
 * finished), then a bare "> " with no trailing newline so the player's
 * typed input continues right after it on the same line. Deliberately a
 * raw socket.write, not writeToSocket - the trailing \r\n and leading-
 * capitalization writeToSocket always adds would both work against a
 * prompt that's meant to sit right before the cursor. Still runs through
 * the same color on/off decision as writeToSocket (see modules/color.js)
 * for whenever the prompt itself gains a color token - a no-op today,
 * since a plain "> " has nothing to render or strip.
 * @param {net.Socket} socket
 */
export function writePrompt(socket) {
  const prompt = "> ";
  const colored = isColorEnabled(socket)
    ? renderColors(prompt)
    : stripColors(prompt);
  socket.write("\r\n" + colored);
}

export function broadcast(room, message, excludeSocket = null) {
  const clients = room.characters || room.occupants || [];
  clients.forEach((client) => {
    if (client !== excludeSocket) {
      writeToSocket(client, message);
    }
  });
}
