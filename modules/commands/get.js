import { isContainer } from "../containers.js";
import { resolveItemToken, formatItemList } from "../itemSearch.js";

export const get = (world, args, character) => {
    const room = world.getRoomById(character.roomId);
    const itemToken = args[0];

    if (!itemToken) {
        return "What do you want to get?";
    }

    const rest = args.slice(1).join(" ");
    if (!rest) {
        return getFromRoom(room, character, itemToken);
    }

    const containerToken = rest.replace(/^from /i, "");
    return getFromContainer(room, character, itemToken, containerToken);
};

function getFromRoom(room, character, itemToken) {
    const { matches, error } = resolveItemToken(itemToken, [room.inventory]);
    if (error) {
        return error;
    }
    if (matches.length === 0) {
        return "You can't find that here.";
    }

    for (const { item, source } of matches) {
        source.splice(source.indexOf(item), 1);
        character.inventory.push(item);
    }

    return `You pick up ${formatItemList(matches.map(m => m.item))}.`;
}

// `get <item> [from] <container>` - "from" is optional/cosmetic, stripped
// the same way give.js strips "to". The container itself is found by
// keyword in the character's own inventory first, then the room floor,
// same order look.js already searches in. Doesn't reach into a container
// that's itself stowed inside another container; take it out first.
function getFromContainer(room, character, itemToken, containerToken) {
    const containerResult = resolveItemToken(containerToken, [character.inventory, room.inventory]);
    if (containerResult.error) {
        return containerResult.error;
    }
    if (containerResult.matches.length === 0) {
        return "You don't see that here.";
    }

    const container = containerResult.matches[0].item;
    if (!isContainer(container)) {
        return `${container.name} can't hold anything.`;
    }

    const { matches, error } = resolveItemToken(itemToken, [container.inventory]);
    if (error) {
        return error;
    }
    if (matches.length === 0) {
        return `You don't see that in ${container.name}.`;
    }

    for (const { item, source } of matches) {
        source.splice(source.indexOf(item), 1);
        character.inventory.push(item);
    }

    return `You get ${formatItemList(matches.map(m => m.item))} from ${container.name}.`;
}
