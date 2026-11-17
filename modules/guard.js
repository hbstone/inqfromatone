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

/**
 * guard for work that finishes later (an LLM call, say): fn may return a
 * value or a promise, and may throw or reject. The promise this returns
 * never rejects - a failure is logged and becomes the fallback - because
 * a rejection nobody catches is fatal (see server.js's unhandledRejection).
 * @template T
 * @param {string} label
 * @param {() => T|Promise<T>} fn
 * @param {T} [fallback]
 * @returns {Promise<T>}
 */
export async function guardAsync(label, fn, fallback = undefined) {
    try {
        return await fn();
    } catch (err) {
        console.error(`Error in ${label}:`, err);
        return fallback;
    }
}
