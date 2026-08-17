import { movePlayer } from "./move.js";

export const west = (world, args, character) => {
    const room = world.getRoomById(character.roomId);
    return movePlayer(world, character, room, "west", "east");
};
