// Shared item-keyword resolution, with fuzzy matching and
// cardinality/ordinality (see ARCHITECTURE.md). Replaces the ad-hoc
// `items.find(i => i.keywords.includes(keyword))` every item-handling
// command used to duplicate. Matching itself is substring-based, via
// keywordMatch.js - "bri" finds "a brick" the same way "brick" would.
// On top of that, two optional qualifiers:
//
//   pouch      -> the first item matching "pouch" (unchanged behavior)
//   2.pouch    -> the 2nd item matching "pouch", ordinal
//   3*brick    -> the first 3 items matching "brick", cardinal
//
// Both qualifiers reduce to the same underlying question - "are there at
// least N matches for this keyword, in this search scope?" - so
// resolveItemToken finds every match once, then either indexes into it
// (ordinal) or takes its front slice (cardinal). Search scope is
// whatever ordered list of inventories the caller passes (e.g.
// [character.inventory, room.inventory]) - the same "check inventory,
// then the room" priority every command already used, just generalized
// to collect N matches across it instead of stopping at the first.
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
// in - callers need that array reference back to splice the item out of
// the right place, since a cardinal match can span sources (e.g. one
// brick already held, two more still on the floor).
function findAllMatches(keyword, sources) {
    const matches = [];
    for (const source of sources) {
        for (const item of source) {
            if (keywordMatches(item.keywords, keyword)) {
                matches.push({ item, source });
            }
        }
    }
    return matches;
}

/**
 * Resolve a raw (optionally qualified) token against an ordered list of
 * candidate inventories.
 * @param {string} rawToken
 * @param {object[][]} sources - Inventories to search, in priority order.
 * @returns {{ matches: { item: object, source: object[] }[], error: string|null }}
 *   `matches` is empty (not an error) when a *plain* keyword finds
 *   nothing - callers keep their own "you don't see that" wording for
 *   that case. `error` is set only when an explicit qualifier (2.x /
 *   N*x) asked for more matches than exist - a ready-to-return,
 *   player-facing message, since that failure mode is the same
 *   everywhere: fail the whole command, nothing gets moved.
 */
export function resolveItemToken(rawToken, sources) {
    const { keyword, ordinal, count } = parseItemToken(rawToken);
    const allMatches = findAllMatches(keyword, sources);
    const requested = ordinal ?? count;

    if (requested != null && allMatches.length < requested) {
        return { matches: [], error: `There aren't ${requested} things matching "${keyword}" here.` };
    }

    if (ordinal != null) {
        return { matches: [allMatches[ordinal - 1]], error: null };
    }
    if (count != null) {
        return { matches: allMatches.slice(0, count), error: null };
    }
    return { matches: allMatches.length > 0 ? [allMatches[0]] : [], error: null };
}

/**
 * Render a list of items as a natural-language list, grouping identical
 * names with an "xN" count instead of pluralizing - item names ("a 0.5
 * lb brick") already carry their own article, which naive pluralization
 * ("3 a bricks") or pattern-matching ("3 bricks") can't handle generally
 * (irregular plurals) without content having to opt in per item. Also
 * the only option that stays correct when a cardinal match is a mix of
 * different items, not just N of the same thing.
 * @param {object[]} items
 * @returns {string}
 */
export function formatItemList(items) {
    const counts = new Map(); // name -> count, insertion order = first-seen order
    for (const item of items) {
        counts.set(item.name, (counts.get(item.name) ?? 0) + 1);
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
