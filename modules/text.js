// Shared text helpers for matching what someone typed against content
// (dialogue topics, NPC sightings). Look here before writing another
// lowercase-and-strip-punctuation function.
//
// Not the same as recognition's wordsOf (modules/recognition/index.js),
// which splits on spaces only: there "whiskey-soaked" stays one keyword,
// because that's what players target someone by. Keep the two apart unless
// that's changed on purpose.

export const ARTICLES = new Set(['a', 'an', 'the']);

/**
 * Lowercase, with punctuation turned into single spaces:
 * "The Card-Game?" -> "the card game".
 * @param {string} text
 * @returns {string}
 */
export function normalizeText(text) {
    return text
        .toLowerCase()
        .replace(/[^a-z0-9']+/g, ' ')
        .trim();
}

/**
 * normalizeText's words, minus articles: "The Card-Game?" -> ["card", "game"].
 * @param {string} text
 * @returns {string[]}
 */
export function wordsOf(text) {
    return normalizeText(text)
        .split(' ')
        .filter((word) => word && !ARTICLES.has(word));
}
