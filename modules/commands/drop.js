import { writeToSocket } from "../utils.js";

export const drop = (world, args, character) => {
    const keyword = args[0];
    const room = world.getRoomById(character.roomId);

    if (!keyword) {
        return "What do you want to drop?";
    }

    // Search the player's inventory for the item
    const itemIndex = character.inventory.findIndex(item =>
        item.keywords.includes(keyword)
    );

    if (itemIndex === -1) {
        return "You can't find that.";
    }

    // Move the item to the room's inventory
    const [item] = character.inventory.splice(itemIndex, 1);
    room.inventory.push(item);

    // Broadcast the action to the room
    room.characters.forEach(char => {
        if (char !== character && char.socket) {
            writeToSocket(
                char.socket,
                `${character.name} drops ${item.name}.`
            );
        }
    });

    return `You drop ${item.name}.`;
};
