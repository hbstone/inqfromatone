// Shared fuzzy keyword matching (see ARCHITECTURE.md) - the one place
// every item- and character-targeting command checks whether what
// someone typed refers to something. A token matches if it's a
// *substring* of any one of the entity's keywords, not just an exact
// match - "get bri pou" finds "a brick" in "a pouch" the same way
// "get brick pouch" would. Deliberately no minimum length: even a single
// character matches, at the risk of also matching whatever else happens
// to share it. Predictable over clever - lean on the existing 2.x/N*x
// item qualifiers (modules/itemSearch.js), or just be more specific, if
// that turns out to be a problem in practice, rather than build a
// fuzziness threshold nobody's asked for yet.
/**
 * @param {string[]} keywords - Assumed already lowercase, as every
 *   keyword in the codebase is (Character.setName, item content).
 * @param {string} rawToken - Not assumed lowercase.
 * @returns {boolean}
 */
export function keywordMatches(keywords, rawToken) {
    const token = rawToken.toLowerCase();
    return keywords.some(keyword => keyword.includes(token));
}
