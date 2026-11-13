import { nameFor, tellRoom } from "../naming.js";
import { resolveItemToken, formatItemList, previewMatch } from "../itemSearch.js";
import { moveMatches } from "../stacking.js";

export const drop = (world, args, character) => {
    const itemToken = args[0];
    const room = world.getRoomById(character.roomId);

    if (!itemToken) {
        return "What do you want to drop?";
    }

    const { matches, error } = resolveItemToken(itemToken, [character.inventory]);
    if (error) {
        return error;
    }
    if (matches.length === 0) {
        return "You can't find that.";
    }

    const message = formatItemList(matches.map(previewMatch));
    moveMatches(matches, room.inventory);
    room.markDirty(); // matches.length > 0 is guaranteed above, so this always touches the room

    // Broadcast the action to the room
    tellRoom(room, (viewer) => `${nameFor(character, viewer)} drops ${message}.`, [character]);

    return `You drop ${message}.`;
};
