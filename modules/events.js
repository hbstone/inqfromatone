// Engine-side event bus (see ARCHITECTURE.md / ROADMAP.md).
//
// Theme packs hook behavior by listening for events instead of editing core
// logic directly, e.g. `on("enterRoom", handler)` instead of patching
// game.js. Core emits the events; the listeners themselves are entirely
// theme-owned.
//
// Unlike the command registry (one verb = one handler), multiple listeners
// can be registered for the same event — more than one pack may care about
// the same lifecycle moment.

const listeners = new Map();

/**
 * Register a listener for an event.
 * @param {string} eventName - The event to listen for.
 * @param {(payload: object) => void} handler
 */
export function on(eventName, handler) {
    if (!listeners.has(eventName)) {
        listeners.set(eventName, []);
    }
    listeners.get(eventName).push(handler);
}

/**
 * Fire an event, calling every listener registered for it in registration
 * order. A listener that throws is logged and skipped rather than allowed
 * to stop sibling listeners or crash the caller — content packs are
 * semi-trusted, and one broken listener shouldn't take down the others.
 * @param {string} eventName - The event to fire.
 * @param {object} [payload] - Event-specific data, passed as-is to each listener.
 */
export function emit(eventName, payload) {
    const handlers = listeners.get(eventName);
    if (!handlers) {
        return;
    }

    for (const handler of handlers) {
        try {
            handler(payload);
        } catch (err) {
            console.error(`Error in "${eventName}" event listener:`, err);
        }
    }
}
