import { writeToSocket } from "../utils.js";
import { loadCharacterState, saveCharacterState } from "../../data.js";

// Shared by the `quit` command and server.js's socket "end" handler
// (ungraceful disconnect) — both need to save, announce the departure, and
// remove the character from their room; only the socket-closing bit at the
// end of `quit` below is specific to a graceful quit.
export const disconnectCharacter = (world, character, departureMessage) => {
    const room = world.getRoomById(character.roomId);
    if (!room) {
        // Already cleaned up (e.g. `quit`'s own socket.end() below re-fires
        // the "end" event server.js listens on) - nothing left to do.
        return;
    }

    // Broadcast to the room about the disconnection
    room.characters.forEach(char => {
        if (char !== character && char.socket) {
            writeToSocket(char.socket, departureMessage);
        }
    });

    // Persist state before removing them from the room, so the saved
    // roomId reflects where they actually were.
    const saved = loadCharacterState(character.name) ?? {};
    saveCharacterState(character.name, { ...saved, ...character.toSaveData() });

    room.removeCharacter(character);
};

export const quit = (world, args, character, socket) => {
    disconnectCharacter(world, character, `${character.name} has left the game.`);
    character.isLoggedIn = false; // so the "end" event this triggers below doesn't clean up twice

    // Socket cleanup
    socket.write("Disconnecting..."); // send the closing message separately...
    setTimeout(() => { // ...so that the client has some time to process and display it...
        socket.end() // ... before closing the connection.
    }, 500);
};
