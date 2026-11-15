// Content keys: zone, room, item and NPC keys, and pack and game names.
// They end up in save-file paths (saves/<game>/rooms/<pack>/<zone>/<key>.json,
// see worldData.js), so they're kept to a filename-safe shape rather than
// relying on content always being well-behaved (see ROADMAP.md's note on
// treating packs as semi-trusted). It also keeps "/" free to separate the
// parts of an id.
export const KEY_PATTERN = /^[a-z0-9][a-z0-9-]*$/;

/**
 * @param {string} key
 * @param {string} label - What it's the key of ("room", "NPC"), for the error.
 */
export function assertValidKey(key, label) {
    if (!KEY_PATTERN.test(key)) {
        throw new Error(`Invalid ${label} key "${key}": use lowercase letters, digits, and dashes.`);
    }
}
