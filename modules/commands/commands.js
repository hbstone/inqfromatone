import { listCommands } from './registry.js';

// `commands` - every registered verb, core and pack alike, alphabetical.
// A stand-in for discoverability until there's a real helpfile system
// (see ROADMAP.md). Laid out in columns so the list stays a few lines
// tall as packs add verbs, with full-word-only commands (see registry.js)
// marked, since abbreviating those does nothing.
const COLUMNS = 4;
const COLUMN_WIDTH = 14;

export const commands = () => {
    const entries = listCommands();
    const cells = entries.map(({ name, abbreviate }) => (abbreviate ? name : `${name}*`));

    const rows = [];
    for (let i = 0; i < cells.length; i += COLUMNS) {
        const row = cells.slice(i, i + COLUMNS).map((cell) => cell.padEnd(COLUMN_WIDTH));
        rows.push(`  ${row.join('').trimEnd()}`);
    }

    const lines = ['Available commands:', ...rows];
    if (entries.some((entry) => !entry.abbreviate)) {
        lines.push('', '* must be typed in full. Others can be abbreviated - try n? to check one.');
    }
    return lines.join('\n');
};
