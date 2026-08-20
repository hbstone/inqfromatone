import { isContainer } from "../containers.js";
import { resolveItemToken } from "../itemSearch.js";

// `items` - testing/debugging aid, not really an in-fiction verb: lists
// every item's name *and* keywords, room floor first then the
// character's own inventory (never another character's), so you can see
// exactly what something responds to instead of guessing.
//
// `items <container>` narrows to just that one container's contents -
// found by keyword in the character's own inventory first, then the room
// floor, same order look.js already searches in. Deliberately not
// recursive: it doesn't reach into a container nested inside another
// container (same restriction put/get already have), so even in a room
// full of nested containers you only ever see one container's worth of
// contents at a time, never a full-tree dump.
function describeItem(item) {
    return `${item.name} [${item.keywords.join(", ")}]`;
}

function formatList(items) {
    return items.length > 0
        ? items.map(item => `  ${describeItem(item)}`).join("\n")
        : "  None";
}

export const items = (world, args, character) => {
    const room = world.getRoomById(character.roomId);
    const containerToken = args[0];

    if (!containerToken) {
        return `Items in the room:\n${formatList(room.inventory)}\n\nItems in your inventory:\n${formatList(character.inventory)}`;
    }

    // Supports the same 2.pouch/3*pouch qualifiers get/put do, though a
    // cardinal match is a moot point here - it always just peeks inside
    // the first one.
    const { matches, error } = resolveItemToken(containerToken, [character.inventory, room.inventory]);
    if (error) {
        return error;
    }
    if (matches.length === 0) {
        return "You don't see that here.";
    }

    const container = matches[0].item;
    if (!isContainer(container)) {
        return `${container.name} can't hold anything.`;
    }

    return `Items in ${container.name}:\n${formatList(container.inventory)}`;
};
