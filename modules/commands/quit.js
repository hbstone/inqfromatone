import { writeToSocket } from "../utils.js";

export const quit = (world, args, character, socket) => {
    const room = world.getRoomById(character.roomId);

    // Broadcast to the room about the disconnection
    room.characters.forEach(char => {
        if (char !== character && char.socket) {
            writeToSocket(
                char.socket,
                `${character.name} has left the game.`
            );
        }
    });

    // Remove the character from the room
    room.removeCharacter(character);

    // Socket cleanup
    socket.write("Disconnecting..."); // send the closing message separately...
    setTimeout(() => { // ...so that the client has some time to process and display it...
        socket.end() // ... before closing the connection.
    }, 500);
};
