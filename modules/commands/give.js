import { writeToSocket } from "../utils.js";

export const give = (world, args, character) => {
    const keyword = args[0];
    const recipientName = args.slice(1).join(" ").replace(/^to /i, "");
    const room = world.getRoomById(character.roomId);

    if (!keyword || !recipientName) {
        return "Usage: give (keyword) [to] (target)";
    }

    // Find the item in the player's inventory
    const itemIndex = character.inventory.findIndex(item =>
        item.keywords.includes(keyword)
    );

    if (itemIndex === -1) {
        return "You can't find that.";
    }

    // Find the recipient in the current room
    const recipient = room.characters.find(char =>
        char.keywords.includes(recipientName.toLowerCase())
    );

    if (!recipient) {
        return "You can't find them.";
    }

    // Transfer the item
    const [item] = character.inventory.splice(itemIndex, 1);
    recipient.inventory.push(item);

    // Notify the recipient
    if (recipient.socket) {
        writeToSocket(
            recipient.socket,
            `${character.name} gives you ${item.name}.`
        );
    }

    // Broadcast the action to the room
    room.characters.forEach(char => {
        if (char !== character && char !== recipient && char.socket) {
            writeToSocket(
                char.socket,
                `${character.name} gives ${item.name} to ${recipient.name}.`
            );
        }
    });

    return `You give ${item.name} to ${recipient.name}.`;
};
