// `help` - every topic in this game; `help <word>` - one topic, found by
// keyword or the start of one. Topics come from help files (see
// modules/content/loadHelp.js).
import { findHelp, helpTopics } from '../content/loadHelp.js';

const COLUMNS = 4;
const COLUMN_WIDTH = 16;

function listing() {
    const names = helpTopics().map((topic) => topic.keywords[0]);
    const rows = [];
    for (let i = 0; i < names.length; i += COLUMNS) {
        rows.push(
            `  ${names
                .slice(i, i + COLUMNS)
                .map((name) => name.padEnd(COLUMN_WIDTH))
                .join('')
                .trimEnd()}`,
        );
    }
    return [
        'Help topics:',
        ...rows,
        '',
        'Type help <topic> to read one, or commands for a list of every command.',
    ].join('\n');
}

export const help = (world, args) => {
    const word = args.join(' ').trim();
    if (!word) {
        return listing();
    }
    const found = findHelp(word);
    if (found.length === 0) {
        return `There's no help on "${word}". Type help for a list of topics.`;
    }
    if (found.length > 1) {
        return `"${word}" could mean: ${found.map((topic) => topic.keywords[0]).join(', ')}.`;
    }
    const [topic] = found;
    const seeAlso = topic.seeAlso.length > 0 ? `\n\nSee also: ${topic.seeAlso.join(', ')}` : '';
    // A title line first: it reads well, and output starts with a capital
    // anyway (see writeToSocket), which would turn "sneak on|off" into "Sneak".
    return `Help: ${topic.keywords[0]}\n\n${topic.text}${seeAlso}`;
};
