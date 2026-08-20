import { canContainAll } from "../containers.js";
import { resolveItemToken, formatItemList } from "../itemSearch.js";

// `put <item> [in] <container>` - drop/give need no changes at all, since
// a container's contents move with it as part of the same Item object
// (see ARCHITECTURE.md's Containers section). "in" is optional/cosmetic,
// stripped the same way give.js strips "to" - the container keyword is
// just everything after the item keyword. Both the item and the
// container are found by keyword in the character's own inventory first,
// then the room floor - same order look.js already searches in. Doesn't
// reach into a container that's itself stowed inside another container;
// take it out first.
export const put = (world, args, character) => {
    const itemToken = args[0];
    const containerToken = args.slice(1).join(" ").replace(/^in /i, "");

    if (!itemToken || !containerToken) {
        return "Usage: put <item> [in] <container>";
    }

    const room = world.getRoomById(character.roomId);
    const sources = [character.inventory, room.inventory];

    const itemResult = resolveItemToken(itemToken, sources);
    if (itemResult.error) {
        return itemResult.error;
    }
    if (itemResult.matches.length === 0) {
        return "You don't have that and don't see it here.";
    }

    const containerResult = resolveItemToken(containerToken, sources);
    if (containerResult.error) {
        return containerResult.error;
    }
    if (containerResult.matches.length === 0) {
        return "You don't see that here.";
    }

    const container = containerResult.matches[0].item;
    const items = itemResult.matches.map(m => m.item);

    const result = canContainAll(container, items);
    if (!result.ok) {
        return result.reason;
    }

    for (const { item, source } of itemResult.matches) {
        source.splice(source.indexOf(item), 1);
        container.inventory.push(item);
    }

    return `You put ${formatItemList(items)} in ${container.name}.`;
};
