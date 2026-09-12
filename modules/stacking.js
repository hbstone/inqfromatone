// Item stacking (see ARCHITECTURE.md): identical, stackable items merge
// into one Item object carrying a `quantity` instead of one object per
// unit. Mirrors containers.js/equipment.js's split - this module only
// knows the generic mechanism, nothing about which content items are
// stackable or how many of one a player happens to be holding.
//
// Deliberately no max stack size - see ARCHITECTURE.md.
import { Item } from "./Item.js";

/**
 * Whether `a` and `b` are the same stackable item and could merge into
 * one stack. Reuses `name` as the identity key - the same thing
 * itemSearch.js's formatItemList already treats as "the same kind of
 * item" for display grouping, so this isn't a new notion of identity.
 * @param {object} a
 * @param {object} b
 * @returns {boolean}
 */
function sameStack(a, b) {
    return a.stackable && b.stackable && a.name === b.name;
}

/**
 * Add `item` to `destination`, merging its quantity into a matching
 * existing stack there instead of appending a second entry, when both are
 * stackable and share the same name. Every command that moves an item
 * into an inventory/container/room (get, drop, give, put, and world/room
 * content loading) should call this instead of a raw `.push()`, so stacks
 * combine no matter which path causes the move. A no-op beyond a plain
 * push for non-stackable items - existing content (bricks, pouches, etc.)
 * is unaffected.
 * @param {object[]} destination
 * @param {object} item
 */
export function addItem(destination, item) {
    const existing = item.stackable ? destination.find(other => sameStack(other, item)) : null;
    if (existing) {
        existing.quantity += item.quantity;
    } else {
        destination.push(item);
    }
}

/**
 * Peel `quantity` units off `item`, decrementing it in place, and return
 * a brand-new Item carrying just the split-off amount - not yet present
 * in any array. Only ever called (via takeMatch below) for a genuine
 * partial claim, so `item.quantity` is assumed to be strictly greater
 * than `quantity` already. Doesn't carry over `container`/`equip` - a
 * stackable item isn't expected to be either (there's no sensible "wear
 * 10 arrows as one slot" or "open this pile as a container"), so there's
 * nothing there worth preserving. `components` is deep-cloned so the
 * split-off item doesn't share mutable state with what's left behind -
 * consistent with ARCHITECTURE.md's assumption that component data is
 * plain, serializable values.
 * @param {object} item
 * @param {number} quantity
 * @returns {object}
 */
function splitStack(item, quantity) {
    item.quantity -= quantity;
    const split = new Item(item.name, item.description, [...item.keywords], {
        size: item.size,
        weight: item.weight,
        stackable: item.stackable,
        quantity,
    });
    split.components = structuredClone(item.components);
    return split;
}

/**
 * Resolve one search match (see itemSearch.js's resolveItemToken) into
 * the actual Item to move - splitting a stack via splitStack above if,
 * and only if, this match is a partial cardinal claim (its `quantity` is
 * less than the matched object's own). A full claim - the common case:
 * plain keyword, ordinal, or a cardinal claim that divides evenly - just
 * removes the object itself, exactly as before stacking existed. This is
 * the one place a match turns into a real mutation; resolveItemToken
 * itself never mutates anything, so a command that inspects matches
 * before deciding whether to commit (put.js's capacity check) or a
 * purely read-only command (look, items) never splits a stack it was
 * only looking at.
 * @param {{item: object, source: object[], quantity: number}} match
 * @returns {object} The item to hand to addItem.
 */
export function takeMatch({ item, source, quantity }) {
    if (quantity >= (item.quantity ?? 1)) {
        source.splice(source.indexOf(item), 1);
        return item;
    }
    return splitStack(item, quantity);
}

/**
 * Move every match into `destination` (see takeMatch and addItem) - the
 * shared move step get/drop/give/put all use instead of a hand-rolled
 * splice-then-push loop, so a partial cardinal claim splits correctly no
 * matter which verb causes the move.
 * @param {{item: object, source: object[], quantity: number}[]} matches
 * @param {object[]} destination
 */
export function moveMatches(matches, destination) {
    for (const match of matches) {
        addItem(destination, takeMatch(match));
    }
}
