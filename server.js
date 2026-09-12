import net from "net";
import { handleCommand, handleDisconnect, saveWorldOnShutdown } from "./game.js";
import { writeToSocket, writePrompt, extractLines, stripTelnetNegotiation } from "./modules/utils.js";
import { Character } from "./modules/Character.js";

// Allow PORT to be overridden via environment variable for deployment flexibility
const PORT = process.env.PORT || 8484;

const server = net.createServer((socket) => {
    socket.character = new Character(); // Initialize character state
    socket.character.socket = socket;
    socket.lineBuffer = ""; // Not-yet-complete input, see extractLines
    writeToSocket(socket, "Welcome to the game! Please enter your character's name:");
    writePrompt(socket);

    socket.on("data", (data) => {
        const cleaned = stripTelnetNegotiation(data);
        const { lines, remainder } = extractLines(socket.lineBuffer, cleaned.toString());
        socket.lineBuffer = remainder;

        for (const input of lines) {
            const response = handleCommand(socket, input);
            if (response) {
                writeToSocket(socket, response);
                writePrompt(socket);
            }
            // No response (e.g. `quit`, which closes the socket itself) -
            // no prompt either, since there's nothing left to prompt for.
        }
    });

    socket.on("end", () => {
        if (socket.character.name) {
            console.log(`${socket.character.name} has disconnected.`);
        }
        handleDisconnect(socket);
    });

    socket.on("error", (err) => {
        console.error("Socket error:", err);
    });
});

server.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});

// Save whatever room state changed since the last periodic tick before a
// graceful stop (e.g. Ctrl+C in dev) - doesn't cover a hard kill/crash, see
// modules/worldPersistence.js.
function shutdown(signal) {
    console.log(`Received ${signal}, saving world state and exiting...`);
    saveWorldOnShutdown();
    process.exit(0);
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
