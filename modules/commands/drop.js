import { writeToSocket } from "../utils.js";
import { resolveItemToken, formatItemList } from "../itemSearch.js";

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

    for (const { item, source } of matches) {
        source.splice(source.indexOf(item), 1);
        room.inventory.push(item);
    }

    const message = formatItemList(matches.map(m => m.item));

    // Broadcast the action to the room
    room.characters.forEach(char => {
        if (char !== character && char.socket) {
            writeToSocket(char.socket, `${character.name} drops ${message}.`);
        }
    });

    return `You drop ${message}.`;
};
