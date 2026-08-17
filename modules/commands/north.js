import { movePlayer } from "./move.js";

export const north = (world, args, character) => {
    const room = world.getRoomById(character.roomId);
    return movePlayer(world, character, room, "north", "south");
};
