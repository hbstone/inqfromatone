import net from "net";
import { handleCommand, handleDisconnect, saveWorldOnShutdown } from "./game.js";
import { writeToSocket, writePrompt, extractLines, stripTelnetNegotiation } from "./modules/utils.js";
import { Character } from "./modules/Character.js";
import { guard } from "./modules/guard.js";

// Allow PORT to be overridden via environment variable for deployment flexibility
const PORT = process.env.PORT || 8484;

const server = net.createServer((socket) => {
    socket.character = new Character(); // Initialize character state
    socket.character.socket = socket;
    socket.lineBuffer = ""; // Not-yet-complete input, see extractLines
    writeToSocket(socket, "Welcome to the game! Please enter your character's name:");
    writePrompt(socket);

    socket.on("data", (data) => guard("socket input", () => {
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
    }));

    // "close", not "end": "end" only fires when the client closes its side
    // cleanly, while a connection that dies with an error (reset, timeout)
    // may skip straight to "close" - which always fires, either way.
    socket.on("close", () => guard("socket close", () => {
        if (socket.character.name && socket.character.socket === socket) {
            console.log(`${socket.character.name} has disconnected.`);
        }
        handleDisconnect(socket);
    }));

    socket.on("error", (err) => {
        console.error("Socket error:", err);
    });
});

server.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});

// Checkpoint the world (rooms + characters, see modules/worldPersistence.js)
// before a graceful stop, e.g. Ctrl+C in dev. A hard kill still can't be
// caught - that's what the periodic checkpoint is for.
function shutdown(signal) {
    console.log(`Received ${signal}, saving world state and exiting...`);
    guard("shutdown save", () => saveWorldOnShutdown("The server is shutting down. Saving your progress."));
    process.exit(0);
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));

// Last line of defense. Commands, timers and socket handlers are already
// guarded individually (modules/guard.js), so reaching here means
// something unexpected escaped. Node's guidance is that the process isn't
// safe to keep running after an uncaught exception, so: best-effort save,
// then exit non-zero (for a supervisor to restart). The save can capture a
// half-finished mutation, but losing up to a minute of everyone's progress
// is the worse outcome.
function fatal(kind, err) {
    console.error(`Fatal ${kind}:`, err);
    guard("emergency save", () => saveWorldOnShutdown("The server hit an error and is restarting - saving your progress."));
    process.exit(1);
}

process.on("uncaughtException", (err) => fatal("uncaught exception", err));
process.on("unhandledRejection", (err) => fatal("unhandled rejection", err));
