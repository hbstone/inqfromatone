import { nameFor, tellRoom } from '../naming.js';
import { emit } from '../events.js';

export const OPPOSITES = { north: 'south', south: 'north', east: 'west', west: 'east' };

// Shared room-transition logic used by the directional commands
// (north/south/east/west), flee, and moving NPCs (modules/npcs/). Pulled
// out so there's one place that emits leaveRoom/enterRoom, instead of
// several call sites to keep in sync.
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
        return 'That path leads nowhere.';
    }

    emit('leaveRoom', { character, room, world });

    const changingZone = room.zone !== nextRoom.zone;
    const fromZone = world.getZone(room.zone);
    const toZone = world.getZone(nextRoom.zone);
    if (changingZone) {
        emit('zoneLeave', { character, zone: fromZone, to: toZone, world });
    }

    // Broadcast the departure
    tellRoom(room, (viewer) => `${nameFor(character, viewer)} leaves to the ${direction}.`, [character]);

    // Whatever they were doing here doesn't come with them (see
    // modules/presence.js). NPC presences come from content, not this.
    character.presence = null;

    // Move the character between rooms, keeping room.characters and
    // character.roomId in sync
    room.removeCharacter(character);
    nextRoom.addCharacter(character);

    // Broadcast the arrival
    tellRoom(nextRoom, (viewer) => `${nameFor(character, viewer)} arrives from the ${opposite}.`, [character]);

    if (changingZone) {
        emit('zoneEnter', { character, zone: toZone, from: fromZone, world });
    }

    emit('enterRoom', { character, room: nextRoom, world });

    // Who's here, but not items: those wait for an explicit `look`.
    return [
        `You move ${direction} to ${nextRoom.coloredName()}.`,
        nextRoom.description,
        nextRoom.describeExits(),
        ...nextRoom.describeCharacters(character),
    ].join('\n');
};
