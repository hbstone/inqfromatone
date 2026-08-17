import { writeToSocket } from "../utils.js";
import { emit } from "../events.js";

// Shared room-transition logic used by the directional commands
// (north/south/east/west). Pulled out so there's one place that emits
// leaveRoom/enterRoom, instead of four call sites to keep in sync.
export const movePlayer = (world, character, room, direction, opposite) => {
    if (!room.exits || !room.exits[direction]) {
        return "You can't go that way.";
    }

    const nextRoom = world.getRoomById(room.exits[direction]);
    if (!nextRoom) {
        return "That path leads nowhere.";
    }

    emit("leaveRoom", { character, room, world });

    // Broadcast the departure
    room.characters.forEach(char => {
        if (char !== character && char.socket) {
            writeToSocket(
                char.socket,
                `${character.name} leaves to the ${direction}.`
            );
        }
    });

    // Move the character between rooms, keeping room.characters and
    // character.roomId in sync
    room.removeCharacter(character);
    nextRoom.addCharacter(character);

    // Broadcast the arrival
    nextRoom.characters.forEach(char => {
        if (char !== character && char.socket) {
            writeToSocket(
                char.socket,
                `${character.name} arrives from the ${opposite}.`
            );
        }
    });

    emit("enterRoom", { character, room: nextRoom, world });

    return `You move ${direction} to ${nextRoom.name}.\n${nextRoom.description}`;
};
