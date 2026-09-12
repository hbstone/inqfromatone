import { isContainer } from "../containers.js";
import { resolveItemToken, formatItemList, previewMatch } from "../itemSearch.js";
import { moveMatches } from "../stacking.js";

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

    const message = formatItemList(matches.map(previewMatch));
    moveMatches(matches, character.inventory);
    room.markDirty(); // matches.length > 0 is guaranteed above, so this always touches the room

    return `You pick up ${message}.`;
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

    const message = formatItemList(matches.map(previewMatch));
    moveMatches(matches, character.inventory);
    // Only the room's own save is affected here - only when the container
    // itself is sitting on the room floor, not when it's on the character.
    if (containerResult.matches[0].source === room.inventory) {
        room.markDirty();
    }

    return `You get ${message} from ${container.name}.`;
}
