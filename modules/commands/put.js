import { canContain } from "../containers.js";

// `put <item> in <container>` - the one new verb containers need; drop/
// give need no changes at all, since a container's contents move with it
// as part of the same Item object (see ARCHITECTURE.md's Containers
// section). Both the item and the container are found by keyword in the
// character's own inventory first, then the room floor - same order
// look.js already searches in. Doesn't reach into a container that's
// itself stowed inside another container; take it out first.
export const put = (world, args, character) => {
    const inIndex = args.indexOf("in");
    if (inIndex < 1 || inIndex === args.length - 1) {
        return "Usage: put <item> in <container>";
    }

    const itemKeyword = args.slice(0, inIndex).join(" ");
    const containerKeyword = args.slice(inIndex + 1).join(" ");

    const room = world.getRoomById(character.roomId);
    const findByKeyword = keyword =>
        character.inventory.find(i => i.keywords.includes(keyword)) ??
        room.inventory.find(i => i.keywords.includes(keyword));

    const item = findByKeyword(itemKeyword);
    if (!item) {
        return "You don't have that and don't see it here.";
    }

    const container = findByKeyword(containerKeyword);
    if (!container) {
        return "You don't see that here.";
    }

    const result = canContain(container, item);
    if (!result.ok) {
        return result.reason;
    }

    const sourceList = character.inventory.includes(item) ? character.inventory : room.inventory;
    sourceList.splice(sourceList.indexOf(item), 1);
    container.inventory.push(item);

    return `You put ${item.name} in ${container.name}.`;
};
