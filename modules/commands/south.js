import { movePlayer } from "./move.js";

export const south = (world, args, character) => {
    const room = world.getRoomById(character.roomId);
    return movePlayer(world, character, room, "south", "north");
};
