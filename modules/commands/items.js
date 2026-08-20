import { isContainer } from "../containers.js";

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
    const containerKeyword = args[0];

    if (!containerKeyword) {
        return `Items in the room:\n${formatList(room.inventory)}\n\nItems in your inventory:\n${formatList(character.inventory)}`;
    }

    const container = character.inventory.find(i => i.keywords.includes(containerKeyword)) ??
        room.inventory.find(i => i.keywords.includes(containerKeyword));
    if (!container) {
        return "You don't see that here.";
    }
    if (!isContainer(container)) {
        return `${container.name} can't hold anything.`;
    }

    return `Items in ${container.name}:\n${formatList(container.inventory)}`;
};
