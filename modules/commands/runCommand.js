// Running one typed line as a character: the one path every command takes,
// whoever is behind it. A player's line arrives from game.js's
// handleCommand; an NPC can run one too (a higher brain tier acting through
// real verbs, see ROADMAP.md's guardrails), and so could someone at the
// keyboard of an NPC some day (staff taking one over). So nothing here
// assumes a connection: the result comes back to the caller, which shows
// it to whoever should see it - the player's socket, or the brain that
// asked.
//
// `allowed` scopes what a character may run: a list of command names, so a
// bartender's brain can say and give but not kill. Checked against the
// command an input resolves to, so abbreviations don't get around it.
import { resolveCommand, explainCommand } from './registry.js';
import { emit } from '../events.js';
import { guard } from '../guard.js';

export const COMMAND_ERROR = "Something went wrong running that command. It's been logged.";
const NOT_UNDERSTOOD = "I don't understand that command.";

/**
 * @param {object} world
 * @param {object} character - A player or an NPC.
 * @param {string} input - The line as typed.
 * @param {{ allowed?: string[] }} [options]
 * @returns {string|void} What the character sees.
 */
export function runCommand(world, character, input, { allowed } = {}) {
    const [typed, ...args] = input.trim().split(/\s+/);

    // `n?` (or `n?anything`, `n? more words`): say what the first word
    // would run, without running it - see explainCommand. Only a `?` in
    // the first word counts, so `say really?` is still just a say.
    const questionMark = typed.indexOf('?');
    if (questionMark !== -1) {
        return explainCommand(typed.slice(0, questionMark));
    }

    // Case-insensitive, abbreviations allowed (`n`, `L`) - see registry.js.
    const resolved = resolveCommand(typed);
    if (!resolved || (allowed && !allowed.includes(resolved.name))) {
        return NOT_UNDERSTOOD;
    }
    const { name: command, handler } = resolved;
    // A bug in one command costs that one command, not the server - see
    // modules/guard.js.
    const result = guard(
        `command "${input}" from ${character.name}`,
        () => handler(world, args, character, character.socket ?? null),
        COMMAND_ERROR,
    );
    emit('command', { character, command, args, result, world });
    return result;
}
