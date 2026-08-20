// `items` - testing/debugging aid, not really an in-fiction verb: lists
// every item's name *and* keywords, room floor first then the
// character's own inventory (never another character's), so you can see
// exactly what something responds to instead of guessing. Only lists
// what's directly there, same as put/get - doesn't reach into a
// container's contents.
function describeItem(item) {
    return `${item.name} [${item.keywords.join(", ")}]`;
}

function formatList(items) {
    return items.length > 0 ? items.map(describeItem).join("\n") : "None";
}

export const items = (world, args, character) => {
    const room = world.getRoomById(character.roomId);

    return `Items in the room:\n${formatList(room.inventory)}\n\nItems in your inventory:\n${formatList(character.inventory)}`;
};
