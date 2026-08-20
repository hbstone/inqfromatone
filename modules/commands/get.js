import { isContainer } from "../containers.js";

export const get = (world, args, character) => {
    const room = world.getRoomById(character.roomId);
    const itemKeyword = args[0];

    if (!itemKeyword) {
        return "What do you want to get?";
    }

    const rest = args.slice(1).join(" ");
    if (!rest) {
        return getFromRoom(room, character, itemKeyword);
    }

    const containerKeyword = rest.replace(/^from /i, "");
    return getFromContainer(room, character, itemKeyword, containerKeyword);
};

function getFromRoom(room, character, keyword) {
    // Search the room's inventory for the item
    const itemIndex = room.inventory.findIndex(item =>
        item.keywords.includes(keyword)
    );

    if (itemIndex === -1) {
        return "You can't find that here.";
    }

    // Move the item to the character's inventory
    const [item] = room.inventory.splice(itemIndex, 1);
    character.inventory.push(item);

    return `You pick up ${item.name}.`;
}

// `get <item> [from] <container>` - "from" is optional/cosmetic, stripped
// the same way give.js strips "to". The container itself is found by
// keyword in the character's own inventory first, then the room floor,
// same order look.js already searches in. Doesn't reach into a container
// that's itself stowed inside another container; take it out first.
function getFromContainer(room, character, itemKeyword, containerKeyword) {
    const container = character.inventory.find(i => i.keywords.includes(containerKeyword)) ??
        room.inventory.find(i => i.keywords.includes(containerKeyword));
    if (!container) {
        return "You don't see that here.";
    }
    if (!isContainer(container)) {
        return `${container.name} can't hold anything.`;
    }

    const itemIndex = container.inventory.findIndex(item => item.keywords.includes(itemKeyword));
    if (itemIndex === -1) {
        return `You don't see that in ${container.name}.`;
    }

    const [item] = container.inventory.splice(itemIndex, 1);
    character.inventory.push(item);

    return `You get ${item.name} from ${container.name}.`;
}
