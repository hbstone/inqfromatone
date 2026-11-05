// Engine-side command registry (see ARCHITECTURE.md).
//
// Core ships a handful of built-in verbs (see index.js), but the registry
// itself is theme-agnostic: a content pack registers its own verbs by
// calling registerCommand the same way core does, without editing this file
// or index.js.
//
// Lookup is case-insensitive and accepts abbreviations, MUD-style: `n` for
// north, `l` for look. An abbreviation resolves to the *first-registered*
// command it's a prefix of, so registration order is the priority order
// for ambiguous prefixes (`s` is south, not say, because index.js
// registers south first). Packs register after core, so core's verbs win
// an ambiguous prefix and a pack can't accidentally hijack `n`. An exact
// name always beats an abbreviation, whatever the order.

const commands = new Map(); // lowercase name -> { handler, abbreviate }

/**
 * Register a command handler under a verb name.
 * @param {string} name - The verb a player types to invoke this command
 *   (stored lowercase; lookup is case-insensitive).
 * @param {(world: object, args: string[], character: object, socket: object) => (string|void)} handler
 * @param {{ abbreviate?: boolean }} [options] - abbreviate: false requires
 *   the full name - for verbs too consequential to trigger by a stray
 *   letter, like `quit`.
 */
export function registerCommand(name, handler, { abbreviate = true } = {}) {
    const key = name.toLowerCase();
    if (commands.has(key)) {
        throw new Error(`Command "${key}" is already registered.`);
    }
    commands.set(key, { handler, abbreviate });
}

/**
 * Resolve what a player typed to a registered command.
 * @param {string} input - The typed verb (any case, possibly abbreviated).
 * @returns {{ name: string, handler: Function }|undefined} The canonical
 *   command name and its handler, or undefined if nothing matches.
 */
export function resolveCommand(input) {
    const typed = input.toLowerCase();
    if (!typed) {
        return undefined;
    }

    const exact = commands.get(typed);
    if (exact) {
        return { name: typed, handler: exact.handler };
    }

    for (const [name, entry] of commands) {
        if (entry.abbreviate && name.startsWith(typed)) {
            return { name, handler: entry.handler };
        }
    }
    return undefined;
}

/**
 * Look up the handler for what a player typed - see resolveCommand.
 * @param {string} input
 * @returns {Function|undefined}
 */
export function getCommand(input) {
    return resolveCommand(input)?.handler;
}
