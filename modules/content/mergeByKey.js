// Merging keyed content (items, stats) from several packs, in game order
// (see ARCHITECTURE.md's "Packs"). Within one pack a repeated key is an
// error, as before (assertUniqueKeys). Across packs, a later pack may
// replace an earlier entry only by marking it `"override": true`; an
// unmarked clash is an error, so two packs can't silently fight over a key,
// and an override with nothing to replace is an error too (likely a typo).
import { assertUniqueKeys } from './assertUniqueKeys.js';

/**
 * @param {{ source: string, entries: object[] }[]} sources - In load order;
 *   `source` names where the entries came from (a pack), for errors.
 * @param {string} label - What the entries are ("item", "stat").
 * @returns {object[]} The merged entries, in first-defined order, without
 *   their `override` flags.
 */
export function mergeByKey(sources, label) {
    const merged = new Map(); // key -> { entry, source }
    for (const { source, entries } of sources) {
        assertUniqueKeys(entries, label);
        for (const entry of entries) {
            if (!entry.key) {
                continue;
            }
            const { override, ...data } = entry;
            const existing = merged.get(entry.key);
            if (existing && !override) {
                throw new Error(
                    `Duplicate ${label} key "${entry.key}": defined by both "${existing.source}" and "${source}" (mark the later one "override": true to replace it).`,
                );
            }
            if (!existing && override) {
                throw new Error(
                    `${label} "${entry.key}" in "${source}" is marked "override" but nothing defines it earlier.`,
                );
            }
            merged.set(entry.key, { entry: data, source });
        }
    }
    return Array.from(merged.values(), ({ entry }) => entry);
}

/**
 * A readable name for where a content directory came from: the pack folder
 * for packs/<name>/content, else the directory's own name.
 * @param {string} contentDir
 * @param {typeof import("path")} path
 */
export function sourceName(contentDir, path) {
    const base = path.basename(contentDir);
    return base === 'content' || base === 'stats'
        ? path.basename(path.dirname(base === 'stats' ? path.dirname(contentDir) : contentDir))
        : base;
}
