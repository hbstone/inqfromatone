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
  const formattedMessage = message.charAt(0).toUpperCase() + message.slice(1);
  socket.write(formattedMessage + "\n");
}

export function broadcast(room, message, excludeSocket = null) {
  const clients = room.characters || room.occupants || [];
  clients.forEach((client) => {
    if (client !== excludeSocket) {
      writeToSocket(client, message);
    }
  });
}
