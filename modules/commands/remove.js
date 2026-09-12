import { keywordMatches } from "../keywordMatch.js";
import { removeModifier } from "../stats.js";

// `remove <item>` - the inverse of wear/wield. Equipment is a slot ->
// item map, not an array, so this doesn't go through itemSearch.js's
// array-based resolveItemToken (same reason look.js's character fallback
// calls keywordMatches directly instead) - a plain fuzzy keyword search
// across whatever's currently equipped is all a handful of slots needs.
// Strips whatever modifiers wear.js applied from this item's (optional)
// `components.equipStats.modifiers` - same tag (`equip:<slot>`) it used
// to apply them, so a purely decorative item with no modifiers is just a
// no-op loop here.
export const remove = (world, args, character) => {
    const itemToken = args.join(" ");
    if (!itemToken) {
        return "What do you want to remove?";
    }

    const slot = Object.keys(character.equipment).find(slot =>
        keywordMatches(character.equipment[slot].keywords, itemToken)
    );
    if (!slot) {
        return "You aren't wearing that.";
    }

    const item = character.equipment[slot];
    delete character.equipment[slot];
    character.inventory.push(item);

    for (const { key } of item.components?.equipStats?.modifiers ?? []) {
        removeModifier(character, key, `equip:${slot}`);
    }

    return `You remove ${item.name}.`;
};
