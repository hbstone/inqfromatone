// Shared by the content loaders (rooms/items, stats, ...). A duplicate
// key is a data integrity error, not a dangling reference: loaders key
// their in-memory/World structures by `key`, so a repeat would silently
// clobber the earlier entry rather than fail visibly. Treat it as fatal,
// same as a JSON parse failure - it's our own core content, so fail
// loudly at startup rather than silently produce corrupted state.
export function assertUniqueKeys(entries, label) {
    const seen = new Set();
    for (const entry of entries) {
        if (!entry.key) continue;
        if (seen.has(entry.key)) {
            throw new Error(`Duplicate ${label} key "${entry.key}" in content data.`);
        }
        seen.add(entry.key);
    }
}
