import { movePlayer } from "./move.js";

export const east = (world, args, character) => {
    const room = world.getRoomById(character.roomId);
    return movePlayer(world, character, room, "east", "west");
};
