// Shared item-keyword resolution, with fuzzy matching and
// cardinality/ordinality (see ARCHITECTURE.md). Replaces the ad-hoc
// `items.find(i => i.keywords.includes(keyword))` every item-handling
// command used to duplicate. Matching itself is substring-based, via
// keywordMatch.js - "bri" finds "a brick" the same way "brick" would.
// On top of that, two optional qualifiers:
//
//   pouch      -> the first item matching "pouch" (unchanged behavior)
//   2.pouch    -> the 2nd item matching "pouch", ordinal (by object)
//   3*brick    -> 3 units matching "brick", cardinal (by unit - see below)
//
// Ordinal counts *objects* ("is there a 2nd matching object at all?").
// Cardinal counts *units* instead, since modules/stacking.js's stacks
// mean one object can represent many units: 3*arrow against a single
// stack of 20 claims 3 of them, not "3 matching objects" (there's only
// one). For a non-stackable item (quantity always 1) this is the exact
// same arithmetic as before - counting units and counting objects
// coincide - so existing content (bricks, pouches) behaves identically.
//
// resolveItemToken is deliberately read-only: a cardinal match that would
// need part of a stack reports how much of that object it's claiming
// (`quantity`, possibly less than the object's own) without actually
// splitting anything yet. modules/stacking.js's takeMatch/moveMatches do
// the real split, and only once a command has fully committed to the
// move (after any validation - see put.js's capacity check) - so a
// command that ultimately fails (or a read-only lookup like look/items)
// never mutates a stack it merely inspected.
//
// Search scope is whatever ordered list of inventories the caller passes
// (e.g. [character.inventory, room.inventory]) - the same "check
// inventory, then the room" priority every command already used.
import { keywordMatches } from "./keywordMatch.js";

const QUALIFIED_TOKEN = /^(?:(\d+)([.*]))?(.+)$/;

/**
 * Parse a raw token into its keyword plus an optional qualifier.
 * @param {string} rawToken
 * @returns {{ keyword: string, ordinal: number|null, count: number|null }}
 */
function parseItemToken(rawToken) {
    const [, numberStr, qualifier, keyword] = rawToken.match(QUALIFIED_TOKEN);
    const lowerKeyword = keyword.toLowerCase();

    if (!numberStr) {
        return { keyword: lowerKeyword, ordinal: null, count: null };
    }

    const n = Number(numberStr);
    return qualifier === "."
        ? { keyword: lowerKeyword, ordinal: n, count: null }
        : { keyword: lowerKeyword, ordinal: null, count: n };
}

// Every item across `sources` (searched in the given order) whose
// keywords match `keyword`, paired with the specific array it was found
// in (callers need that array reference back to splice the item out of
// the right place) and how many units of it a whole-object claim would
// be (`item.quantity ?? 1`) - the starting point cardinal matching below
// narrows down when it only wants part of one.
function findAllMatches(keyword, sources) {
    const matches = [];
    for (const source of sources) {
        for (const item of source) {
            if (keywordMatches(item.keywords, keyword)) {
                matches.push({ item, source, quantity: item.quantity ?? 1 });
            }
        }
    }
    return matches;
}

// Claim exactly `count` units across `allMatches`, in the same
// priority order they were found - a whole object's worth while there's
// enough count left to fully cover it, then a partial claim (`quantity`
// less than that object's own) on whichever object would otherwise
// overshoot. Doesn't mutate anything; `allMatches` already told us each
// object's own quantity, so this is just arithmetic over that.
function claimUnits(allMatches, count) {
    const claimed = [];
    let remaining = count;
    for (const match of allMatches) {
        if (remaining <= 0) {
            break;
        }
        const take = Math.min(remaining, match.quantity);
        claimed.push({ ...match, quantity: take });
        remaining -= take;
    }
    return claimed;
}

/**
 * Resolve a raw (optionally qualified) token against an ordered list of
 * candidate inventories.
 * @param {string} rawToken
 * @param {object[][]} sources - Inventories to search, in priority order.
 * @returns {{ matches: { item: object, source: object[], quantity: number }[], error: string|null }}
 *   `matches` is empty (not an error) when a *plain* keyword finds
 *   nothing - callers keep their own "you don't see that" wording for
 *   that case. `error` is set only when an explicit qualifier (2.x /
 *   N*x) asked for more than exists - a ready-to-return, player-facing
 *   message, since that failure mode is the same everywhere: fail the
 *   whole command, nothing gets moved. Ordinal checks against the number
 *   of matching *objects*; cardinal checks against the total *units*
 *   across them (see the file-level comment above) - a match's own
 *   `quantity` is the object's full amount for a plain/ordinal match, but
 *   may be less than that for the specific cardinal match that only
 *   partially claims an object.
 */
export function resolveItemToken(rawToken, sources) {
    const { keyword, ordinal, count } = parseItemToken(rawToken);
    const allMatches = findAllMatches(keyword, sources);

    if (ordinal != null) {
        if (allMatches.length < ordinal) {
            return { matches: [], error: `There aren't ${ordinal} things matching "${keyword}" here.` };
        }
        return { matches: [allMatches[ordinal - 1]], error: null };
    }

    if (count != null) {
        const availableUnits = allMatches.reduce((sum, match) => sum + match.quantity, 0);
        if (availableUnits < count) {
            return { matches: [], error: `There aren't ${count} things matching "${keyword}" here.` };
        }
        return { matches: claimUnits(allMatches, count), error: null };
    }

    return { matches: allMatches.length > 0 ? [allMatches[0]] : [], error: null };
}

/**
 * A read-only stand-in for what a match actually claims - `match.item`
 * itself when the claim is the object's whole quantity (the common
 * case: plain keyword, ordinal, or a cardinal claim that divides evenly -
 * preserves object identity, which containers.js's self/cycle checks
 * rely on), or a shallow clone carrying just the claimed `quantity` for a
 * partial cardinal claim. Never mutates `match.item` - use this for
 * display (formatItemList) or a capacity check (canContainAll) before a
 * move is committed; modules/stacking.js's takeMatch is what actually
 * performs a split, and only once a command commits to the move.
 * @param {{item: object, quantity: number}} match
 * @returns {object}
 */
export function previewMatch(match) {
    const wholeObject = match.quantity === (match.item.quantity ?? 1);
    return wholeObject ? match.item : { ...match.item, quantity: match.quantity };
}

/**
 * A single item's own display name, with a "(xN)" quantity suffix when
 * it's a stack (see modules/stacking.js) of more than one. For listing
 * one item on its own - formatItemList below handles the "several items,
 * possibly different kinds" case.
 * @param {object} item
 * @returns {string}
 */
export function itemDisplayName(item) {
    return item.quantity > 1 ? `${item.name} (x${item.quantity})` : item.name;
}

/**
 * Render a list of items as a natural-language list, grouping identical
 * names with an "xN" count instead of pluralizing - item names ("a 0.5
 * lb brick") already carry their own article, which naive pluralization
 * ("3 a bricks") or pattern-matching ("3 bricks") can't handle generally
 * (irregular plurals) without content having to opt in per item. Also
 * the only option that stays correct when a cardinal match is a mix of
 * different items, not just N of the same thing - or, now, a mix of
 * ordinary items and an already-merged stack, since a stack's own
 * quantity counts toward its name's total the same as multiple separate
 * objects would.
 * @param {object[]} items
 * @returns {string}
 */
export function formatItemList(items) {
    const counts = new Map(); // name -> count, insertion order = first-seen order
    for (const item of items) {
        counts.set(item.name, (counts.get(item.name) ?? 0) + (item.quantity ?? 1));
    }

    const parts = Array.from(counts, ([name, count]) => (count > 1 ? `${name} (x${count})` : name));

    if (parts.length <= 1) {
        return parts.join("");
    }
    if (parts.length === 2) {
        return `${parts[0]} and ${parts[1]}`;
    }
    return `${parts.slice(0, -1).join(", ")}, and ${parts[parts.length - 1]}`;
}
