import { writeToSocket } from "../utils.js";

export const look = (world, args, character) => {
    const keyword = args[0];
    const room = world.getRoomById(character.roomId);

    if (!keyword) {
        const occupantNames = room.characters
            .filter(c => c !== character)
            .map(c => c.name);
        const items = room.inventory.map(item => item.name).join(", ") || "None";

        return `${room.name}\n${room.description}\nCharacters here: ${occupantNames.join(", ") || "None"}\nItems here: ${items}`;
    }

    // Look for an item in the player's inventory
    const itemInInventory = character.inventory.find(item =>
        item.keywords.includes(keyword)
    );
    if (itemInInventory) {
        return `You look at ${itemInInventory.name}: ${itemInInventory.description}`;
    }

    // Look for an item in the room
    const itemInRoom = room.inventory.find(item =>
        item.keywords.includes(keyword)
    );
    if (itemInRoom) {
        return `You look at ${itemInRoom.name}: ${itemInRoom.description}`;
    }

    // Look for a character in the room
    const targetCharacter = room.characters.find(char =>
        char.keywords.includes(keyword)
    );
    if (targetCharacter) {
        // Notify the target character
        if (targetCharacter.socket) {
            writeToSocket(
                targetCharacter.socket,
                `${character.name} looks at you.`
            );
        }
        return `You look at ${targetCharacter.name}: ${targetCharacter.description}`;
    }

    return "You can't find that here.";
};
