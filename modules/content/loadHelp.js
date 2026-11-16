// Help topics (see ARCHITECTURE.md's "Help"). Core's are in the repo's
// help/ folder; each pack can add or replace topics in its content/help/.
// One plain-text file per topic, a few header lines, a blank line, then
// the text:
//
//   keywords: sneak, sneaking, stealth
//   commands: sneak
//   see also: look, get
//
//   sneak [on|off]
//   Move quietly...
//
// - keywords: what `help <word>` finds it by. The first is the topic's
//   name in the `help` listing. A topic's commands count as keywords too.
// - commands: the verbs it documents. A topic whose commands aren't all in
//   this game (recognition's, without recognition) is left out. Topics
//   without commands (concepts like "abbreviations") always show.
// - see also: other topics, by name.
//
// A topic is identified by its file name: a later pack's sneak.txt
// replaces an earlier one's, in game order like all content.
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { resolveCommand } from '../commands/registry.js';

export const CORE_HELP_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'help');

const HEADERS = ['keywords', 'commands', 'see also'];

let topics = new Map(); // file name (no .txt) -> topic

const listOf = (value) =>
    value
        .split(',')
        .map((word) => word.trim().toLowerCase())
        .filter(Boolean);

/**
 * Read one help file.
 * @param {string} text
 * @param {string} where - The file, for errors.
 * @returns {{ keywords: string[], commands: string[], seeAlso: string[], text: string }}
 */
export function parseHelp(text, where) {
    const lines = text.replace(/\r\n/g, '\n').split('\n');
    const blank = lines.findIndex((line) => line.trim() === '');
    if (blank === -1) {
        throw new Error(`${where}: needs header lines, a blank line, then the text.`);
    }
    const headers = {};
    for (const line of lines.slice(0, blank)) {
        const match = line.match(/^([a-z ]+):\s*(.*)$/i);
        const name = match?.[1].trim().toLowerCase();
        if (!match || !HEADERS.includes(name)) {
            throw new Error(`${where}: unknown header line "${line}" (known: ${HEADERS.join(', ')}).`);
        }
        headers[name] = listOf(match[2]);
    }
    const commands = headers.commands ?? [];
    const keywords = [...(headers.keywords ?? []), ...commands.filter((c) => !headers.keywords?.includes(c))];
    if (keywords.length === 0) {
        throw new Error(`${where}: needs a "keywords" (or "commands") line.`);
    }
    const body = lines
        .slice(blank + 1)
        .join('\n')
        .trim();
    if (!body) {
        throw new Error(`${where}: has no text.`);
    }
    return { keywords, commands, seeAlso: headers['see also'] ?? [], text: body };
}

/**
 * Load help topics: core's, then each content directory's help/, later
 * ones replacing earlier ones with the same file name.
 * @param {string[]} contentDirs - In game order.
 * @param {string} [coreDir] - Overridable for tests.
 */
export function loadHelp(contentDirs = [], coreDir = CORE_HELP_DIR) {
    const loaded = new Map();
    for (const dir of [coreDir, ...contentDirs.map((d) => path.join(d, 'help'))]) {
        if (!fs.existsSync(dir)) {
            continue;
        }
        for (const file of fs
            .readdirSync(dir)
            .filter((f) => f.endsWith('.txt'))
            .sort()) {
            const filePath = path.join(dir, file);
            const name = file.slice(0, -'.txt'.length);
            loaded.set(name, { name, ...parseHelp(fs.readFileSync(filePath, 'utf-8'), filePath) });
        }
    }
    topics = loaded;
}

// In this game: every verb it documents is registered.
function available(topic) {
    return topic.commands.every((command) => resolveCommand(command)?.name === command);
}

/** Every topic in this game, by name. */
export function helpTopics() {
    return [...topics.values()].filter(available).sort((a, b) => a.keywords[0].localeCompare(b.keywords[0]));
}

/**
 * Topics for a word: those with it as a keyword, else those with a keyword
 * starting with it.
 * @param {string} word
 * @returns {object[]}
 */
export function findHelp(word) {
    const wanted = word.toLowerCase();
    const all = helpTopics();
    const exact = all.filter((topic) => topic.keywords.includes(wanted));
    return exact.length > 0 ? exact : all.filter((topic) => topic.keywords.some((k) => k.startsWith(wanted)));
}

/** Registered verbs no topic documents (for the test that keeps help complete). */
export function commandsWithoutHelp(commandNames) {
    const documented = new Set(helpTopics().flatMap((topic) => topic.commands));
    return commandNames.filter((name) => !documented.has(name));
}
