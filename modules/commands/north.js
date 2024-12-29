import { writeToSocket } from "../utils.js";

export const north = (world, args, character) => {
    const room = world.getRoomById(character.roomId);

    if (!room.exits || !room.exits.north) {
        return "You can't go that way.";
    }

    const nextRoom = world.getRoomById(room.exits.north);
    if (!nextRoom) {
        return "That path leads nowhere.";
    }

    // Broadcast the departure
    room.characters.forEach(char => {
        if (char !== character && char.socket) {
            writeToSocket(
                char.socket,
                `${character.name} leaves to the north.`
            );
        }
    });

    // Update the character's room ID
    character.roomId = nextRoom.id;

    // Broadcast the arrival
    nextRoom.characters.forEach(char => {
        if (char.socket) {
            writeToSocket(
                char.socket,
                `${character.name} arrives from the south.`
            );
        }
    });

    return `You move north to ${nextRoom.name}.\n${nextRoom.description}`;
};
