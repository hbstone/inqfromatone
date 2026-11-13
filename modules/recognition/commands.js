// Recognition's commands: remember, forget, rename, shortdesc. See
// index.js for the model and ARCHITECTURE.md's "Recognition" for the
// reasoning.
import { findCharacter, nameFor } from "../naming.js";
import { keywordMatches } from "../keywordMatch.js";
import { findInWorldCharacter } from "../connection.js";
import { loadCharacterState } from "../../data.js";
import { identityOf, memoryOf, wordsOf, validateShortDesc, recognitionSettings } from "./index.js";

const NAME_MAX_LENGTH = 30;
const NAME_MAX_WORDS = 4;
const NAME_PATTERN = /^[A-Za-z][A-Za-z '.-]*$/;
const NOTE_MAX_LENGTH = 400;
const NOTES_MAX = 50;

/**
 * Check a name someone wants to remember a person by.
 * @param {string} text
 * @returns {{ value: string }|{ error: string, tooLong?: boolean }}
 */
function validateName(text) {
    const value = text.trim().replace(/\s+/g, " ");
    if (value.length > NAME_MAX_LENGTH || value.split(" ").length > NAME_MAX_WORDS) {
        return { error: `That's too long for a name (${NAME_MAX_LENGTH} characters and ${NAME_MAX_WORDS} words at most).`, tooLong: true };
    }
    if (!NAME_PATTERN.test(value)) {
        return { error: "A name may only use letters, spaces, and ' . -" };
    }
    return { value };
}

/**
 * Find which of your memories a keyword means, by the name you gave them.
 * An exact word beats a partial match, so "jerk" picks Insolent Jerk over
 * Jerkins if both exist.
 * @returns {{ key: string, memory: object }[]} Every equally good match.
 */
function matchMemories(character, token) {
    const entries = Object.entries(character.memories ?? {});
    const exact = entries.filter(([, memory]) => wordsOf(memory.name).includes(token.toLowerCase()));
    const found = exact.length > 0 ? exact : entries.filter(([, memory]) => keywordMatches(wordsOf(memory.name), token));
    return found.map(([key, memory]) => ({ key, memory }));
}

/**
 * Resolve a keyword to an existing memory: your remembered names first,
 * then someone in the room you've already remembered (matched by what you
 * see of them). Never creates one.
 * @returns {{ key: string, memory: object }|{ error: string }|null}
 */
function findMemory(world, character, token) {
    const matches = matchMemories(character, token);
    if (matches.length > 1) {
        return { error: `"${token}" could be ${matches.map(m => m.memory.name).join(" or ")}. Be more specific.` };
    }
    if (matches.length === 1) {
        return matches[0];
    }
    const room = world.getRoomById(character.roomId);
    const present = room && findCharacter(character, room.characters.filter(c => c !== character && !c.isNpc), token);
    const memory = present && memoryOf(character, present);
    return memory ? { key: identityOf(present), memory } : null;
}

// Their short description now, if they're online or have a save to read
// it from.
function currentShortDescOf(world, key) {
    const online = findInWorldCharacter(world, key);
    if (online) {
        return online.shortDesc ?? null;
    }
    return loadCharacterState(key, recognitionSettings.charactersDir)?.shortDesc ?? null;
}

function describeMemory(world, key, memory) {
    const now = currentShortDescOf(world, key);
    const lines = [memory.name];
    if (now) {
        lines.push(`  Looks like: ${now}`);
    }
    if (memory.knewAs && memory.knewAs !== now) {
        lines.push(`  When you named them: ${memory.knewAs}`);
    }
    if (memory.notes.length === 0) {
        lines.push(`  No notes yet. Add one with: remember ${wordsOf(memory.name)[0] ?? "<keyword>"} <note>`);
    } else {
        lines.push("  Notes:");
        memory.notes.forEach((note, i) => lines.push(`    ${i + 1}. [${note.at.slice(0, 10)}] ${note.text}`));
    }
    return lines.join("\n");
}

function addNote(memory, text) {
    if (memory.notes.length >= NOTES_MAX) {
        return `You can't hold any more notes about ${memory.name} (${NOTES_MAX} at most). Clear them with: forget <keyword> memories`;
    }
    if (text.length > NOTE_MAX_LENGTH) {
        return `That note is too long (${NOTE_MAX_LENGTH} characters at most).`;
    }
    memory.notes.push({ text, at: new Date().toISOString() });
    return `You add a note about ${memory.name}.`;
}

function listMemories(character) {
    const memories = Object.values(character.memories ?? {})
        .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));
    if (memories.length === 0) {
        return "You don't remember anyone yet. Usage: remember <keyword> <name>";
    }
    const lines = memories.map(memory => {
        const notes = memory.notes.length === 1 ? "1 note" : `${memory.notes.length} notes`;
        return `  ${memory.name}${memory.knewAs ? ` (${memory.knewAs})` : ""} - ${notes}`;
    });
    return ["You remember:", ...lines].join("\n");
}

// `remember` - list who you remember.
// `remember <keyword>` - show one memory and its notes.
// `remember <keyword> <text>` - for someone you remember: add a note. For
//   a stranger in the room: remember them by <text> as a name.
// Your memories are checked before strangers, so a note meant for someone
// you know can never become a stranger's name.
export const remember = (world, args, character) => {
    const [token, ...rest] = args;
    const text = rest.join(" ").trim();
    if (!token) {
        return listMemories(character);
    }

    const found = findMemory(world, character, token);
    if (found?.error) {
        return found.error;
    }
    if (found) {
        return text ? addNote(found.memory, text) : describeMemory(world, found.key, found.memory);
    }

    const room = world.getRoomById(character.roomId);
    const target = findCharacter(character, room.characters.filter(c => c !== character), token);
    if (!target) {
        return `You don't remember anyone matching "${token}", and don't see anyone like that here.`;
    }
    if (target.isNpc) {
        return `You can't remember ${nameFor(target, character)}; NPCs can't be remembered yet.`;
    }
    if (!text) {
        return `Remember ${nameFor(target, character)} as what? Usage: remember <keyword> <name>`;
    }

    const name = validateName(text);
    if (name.error) {
        return name.tooLong
            ? `${name.error} If you meant to add a note: you don't remember anyone matching "${token}" yet.`
            : name.error;
    }
    const knewAs = target.shortDesc ?? null;
    character.memories[identityOf(target)] = { name: name.value, knewAs, notes: [] };
    return `You'll remember ${knewAs ?? "them"} as ${name.value}.`;
};

// `forget <keyword>` - forget someone entirely, but only once their notes
// are gone: `forget <keyword> memories` clears those first. Two steps, so
// a long history can't vanish with one command.
export const forget = (world, args, character) => {
    const [token, ...rest] = args;
    const extra = rest.join(" ").trim().toLowerCase();
    if (!token || (extra && extra !== "memories")) {
        return "Usage: forget <keyword>, or forget <keyword> memories to clear your notes first.";
    }

    const found = findMemory(world, character, token);
    if (found?.error) {
        return found.error;
    }
    if (!found) {
        return `You don't remember anyone matching "${token}".`;
    }
    const { key, memory } = found;

    if (extra === "memories") {
        const count = memory.notes.length;
        memory.notes = [];
        return count === 0
            ? `You have no notes about ${memory.name}.`
            : `You clear your ${count === 1 ? "note" : `${count} notes`} about ${memory.name}.`;
    }
    if (memory.notes.length > 0) {
        const notes = memory.notes.length === 1 ? "a note" : `${memory.notes.length} notes`;
        return `You still have ${notes} about ${memory.name}. To forget them entirely, first clear those with: forget ${token} memories`;
    }
    delete character.memories[key];
    return `You forget ${memory.name}. They'll be a stranger to you again.`;
};

// `rename <keyword> <new name>` - change the name you remember someone by.
// Also updates the look you knew them by, if their current one is known.
export const rename = (world, args, character) => {
    const [token, ...rest] = args;
    const text = rest.join(" ").trim();
    if (!token || !text) {
        return "Usage: rename <keyword> <new name>";
    }
    const found = findMemory(world, character, token);
    if (found?.error) {
        return found.error;
    }
    if (!found) {
        return `You don't remember anyone matching "${token}".`;
    }
    const name = validateName(text);
    if (name.error) {
        return name.error;
    }
    const oldName = found.memory.name;
    found.memory.name = name.value;
    found.memory.knewAs = currentShortDescOf(world, found.key) ?? found.memory.knewAs;
    return `You'll now think of ${oldName} as ${name.value}.`;
};

// `shortdesc` - show how strangers see you; `shortdesc <text>` - change it.
// People who remember you still do.
export const shortdesc = (world, args, character) => {
    if (args.length === 0) {
        return character.shortDesc
            ? `Strangers see you as "${character.shortDesc}". Change it with: shortdesc <description>`
            : "You don't have a short description yet. Set one with: shortdesc <description>";
    }
    const result = validateShortDesc(args.join(" "), character.name);
    if (result.error) {
        return result.error;
    }
    character.shortDesc = result.value;
    return `Strangers now see you as "${result.value}".`;
};
