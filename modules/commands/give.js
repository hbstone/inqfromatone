import { writeToSocket } from "../utils.js";
import { resolveItemToken, formatItemList } from "../itemSearch.js";
import { keywordMatches } from "../keywordMatch.js";

export const give = (world, args, character) => {
    const itemToken = args[0];
    const recipientName = args.slice(1).join(" ").replace(/^to /i, "");
    const room = world.getRoomById(character.roomId);

    if (!itemToken || !recipientName) {
        return "Usage: give (keyword) [to] (target)";
    }

    const { matches, error } = resolveItemToken(itemToken, [character.inventory]);
    if (error) {
        return error;
    }
    if (matches.length === 0) {
        return "You can't find that.";
    }

    // Find the recipient in the current room
    const recipient = room.characters.find(char => keywordMatches(char.keywords, recipientName));

    if (!recipient) {
        return "You can't find them.";
    }

    for (const { item, source } of matches) {
        source.splice(source.indexOf(item), 1);
        recipient.inventory.push(item);
    }

    const message = formatItemList(matches.map(m => m.item));

    // Notify the recipient
    if (recipient.socket) {
        writeToSocket(
            recipient.socket,
            `${character.name} gives you ${message}.`
        );
    }

    // Broadcast the action to the room
    room.characters.forEach(char => {
        if (char !== character && char !== recipient && char.socket) {
            writeToSocket(
                char.socket,
                `${character.name} gives ${message} to ${recipient.name}.`
            );
        }
    });

    return `You give ${message} to ${recipient.name}.`;
};
