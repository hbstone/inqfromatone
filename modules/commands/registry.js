// Engine-side command registry (see ARCHITECTURE.md).
//
// Core ships a handful of built-in verbs (see index.js), but the registry
// itself is theme-agnostic: a content pack registers its own verbs by
// calling registerCommand the same way core does, without editing this file
// or index.js.

const commands = new Map();

/**
 * Register a command handler under a verb name.
 * @param {string} name - The verb a player types to invoke this command.
 * @param {(world: object, args: string[], character: object, socket: object) => (string|void)} handler
 */
export function registerCommand(name, handler) {
    if (commands.has(name)) {
        throw new Error(`Command "${name}" is already registered.`);
    }
    commands.set(name, handler);
}

/**
 * Look up the handler registered for a verb.
 * @param {string} name - The verb to look up.
 * @returns {Function|undefined} The handler, or undefined if nothing is registered.
 */
export function getCommand(name) {
    return commands.get(name);
}
