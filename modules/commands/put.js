import { canContainAll } from "../containers.js";
import { resolveItemToken, formatItemList, previewMatch } from "../itemSearch.js";
import { moveMatches } from "../stacking.js";

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
    // Previews (whole objects for a full claim, a lightweight clone
    // holding just the claimed amount for a partial one - see
    // itemSearch.js's previewMatch) so the capacity check weighs what
    // would actually move, not an object's full current quantity when
    // only part of it is going in - and so nothing gets split below
    // before we know the whole put will succeed.
    const previews = itemResult.matches.map(previewMatch);

    const result = canContainAll(container, previews);
    if (!result.ok) {
        return result.reason;
    }

    moveMatches(itemResult.matches, container.inventory);
    // The room's saved state is affected either if an item left the room
    // floor, or if the container gaining it is itself sitting there.
    const touchesRoom = itemResult.matches.some(m => m.source === room.inventory)
        || containerResult.matches[0].source === room.inventory;
    if (touchesRoom) {
        room.markDirty();
    }

    return `You put ${formatItemList(previews)} in ${container.name}.`;
};
