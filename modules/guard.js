// Error isolation for code the engine runs on the player's behalf - command
// handlers, scheduler jobs, per-entity saves. A bug in any one of those should
// cost that one action (logged, and the player told something went wrong),
// not crash the whole process and take every connection and every unsaved
// change down with it. Same idea events.js already applies per listener.

/**
 * Run fn, logging (rather than rethrowing) anything it throws.
 * @template T
 * @param {string} label - What was running, for the log line.
 * @param {() => T} fn
 * @param {T} [fallback] - Returned instead of fn's result if it throws.
 * @returns {T}
 */
export function guard(label, fn, fallback = undefined) {
    try {
        return fn();
    } catch (err) {
        console.error(`Error in ${label}:`, err);
        return fallback;
    }
}

