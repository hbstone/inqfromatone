import { writeToSocket } from "../utils.js";
import { emit } from "../events.js";

// Shared room-transition logic used by the directional commands
// (north/south/east/west). Pulled out so there's one place that emits
// leaveRoom/enterRoom, instead of four call sites to keep in sync.
//
// Crossing into another zone also emits zoneLeave/zoneEnter, nested inside
// the room events (leaveRoom, zoneLeave, move, zoneEnter, enterRoom). Core
// prints nothing for them - unlike arriving in a room, entering a zone has
// no default message; they're hooks for themes (ambient text, regional
// effects). See ARCHITECTURE.md's "Zones".
export const movePlayer = (world, character, room, direction, opposite) => {
    if (!room.exits || !room.exits[direction]) {
        return "You can't go that way.";
    }

    const nextRoom = world.getRoomById(room.exits[direction]);
    if (!nextRoom) {
        return "That path leads nowhere.";
    }

    emit("leaveRoom", { character, room, world });

    const changingZone = room.zone !== nextRoom.zone;
    const fromZone = world.getZone(room.zone);
    const toZone = world.getZone(nextRoom.zone);
    if (changingZone) {
        emit("zoneLeave", { character, zone: fromZone, to: toZone, world });
    }

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

    if (changingZone) {
        emit("zoneEnter", { character, zone: toZone, from: fromZone, world });
    }

    emit("enterRoom", { character, room: nextRoom, world });

    return `You move ${direction} to ${nextRoom.coloredName()}.\n${nextRoom.description}\n${nextRoom.describeExits()}`;
};
