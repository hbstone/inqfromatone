import { getSession, disengageCombat } from "../combat/session.js";
import { movePlayer } from "./move.js";

const OPPOSITES = { north: "south", south: "north", east: "west", west: "east" };

// A disengage combined with a move - but only if the move is actually
// possible. An invalid direction fails outright (no disengage happens)
// rather than pulling someone out of combat with nowhere to go.
export const flee = (world, args, character) => {
    const direction = args[0]?.toLowerCase();
    if (!OPPOSITES[direction]) {
        return "Flee which direction? (north, south, east, or west)";
    }

    const room = world.getRoomById(character.roomId);
    if (!room.exits || !room.exits[direction]) {
        return "There's no way out that direction - you can't flee that way!";
    }

    if (getSession(character)) {
        disengageCombat(character);
    }

    return movePlayer(world, character, room, direction, OPPOSITES[direction]);
};
