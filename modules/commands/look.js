import { writeToSocket } from "../utils.js";
import { findCharacter, nameFor } from "../naming.js";
import { isContainer } from "../containers.js";
import { resolveItemToken, itemDisplayName, previewMatch } from "../itemSearch.js";

// A container's contents only show up when you look at it directly, not
// in the room/inventory listing above - keeps that listing from turning
// into a nested dump, and matches put/get's "explicit container name
// required" style.
function describeItem(item) {
    const base = `You look at ${itemDisplayName(item)}: ${item.description}`;
    if (!isContainer(item)) {
        return base;
    }
    const contents = item.inventory.map(itemDisplayName).join(", ") || "nothing";
    return `${base}\nIt contains: ${contents}.`;
}

export const look = (world, args, character) => {
    const itemToken = args[0];
    const room = world.getRoomById(character.roomId);

    if (!itemToken) {
        const items = room.inventory.map(itemDisplayName).join(", ") || "None";

        return [
            room.coloredName(),
            room.description,
            room.describeExits(),
            ...room.describeCharacters(character),
            `{YItems here:{x ${items}`,
        ].join("\n");
    }

    // Look for an item, in the player's inventory first, then the room -
    // supports 2.pouch/3*brick qualifiers like get/put do; a cardinal
    // match describes each one in turn.
    const { matches, error } = resolveItemToken(itemToken, [character.inventory, room.inventory]);
    if (error) {
        return error;
    }
    if (matches.length > 0) {
        return matches.map(m => describeItem(previewMatch(m))).join("\n\n");
    }

    // Look for a character in the room
    const targetCharacter = findCharacter(character, room.characters, itemToken);
    if (targetCharacter) {
        // Notify the target character
        if (targetCharacter.socket) {
            writeToSocket(
                targetCharacter.socket,
                `${nameFor(character, targetCharacter)} looks at you.`
            );
        }
        return `You look at ${nameFor(targetCharacter, character)}: ${targetCharacter.description}`;
    }

    return "You can't find that here.";
};
