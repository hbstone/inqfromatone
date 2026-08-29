// Core equipment mechanism (see ARCHITECTURE.md's Equipment section).
// Mirrors containers.js's split: this module only knows the generic shape
// - an item can be equipped into a named slot, and a slot holds at most
// one item at a time - and nothing about which items are equippable, what
// a slot is called, or what wearing/wielding something actually does in
// play. An item is equippable exactly when its `equip` field ({ slot }) is
// set; the slot name is an open string, same as a stat's `role` tag in
// stats.js - core never enumerates them. The one exception, same as
// vitality/offense/defense there, is combat treating `weapon` as a
// recognized slot once it needs to look one up (see modules/combat/index.js).
//
// This module only validates - same as canContain/canContainAll for
// containers - the actual inventory/equipment array mutation happens in
// the calling command (modules/commands/wear.js, remove.js).

/**
 * @param {object} item
 * @returns {boolean} Whether this item can be equipped into a slot.
 */
export function isEquippable(item) {
    return item.equip != null;
}

/**
 * Whether `character` can equip `item` right now.
 * @param {object} character
 * @param {object} item
 * @returns {{ ok: true } | { ok: false, reason: string }} `reason` is a
 *   player-facing message, ready to return straight from a command.
 */
export function canEquip(character, item) {
    if (!isEquippable(item)) {
        return { ok: false, reason: `${item.name} can't be worn or wielded.` };
    }

    const { slot } = item.equip;
    if (character.equipment[slot]) {
        return { ok: false, reason: `You're already wearing something on your ${slot}. Remove it first.` };
    }

    return { ok: true };
}
