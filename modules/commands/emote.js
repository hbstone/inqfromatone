import { writeToSocket } from "../utils.js";

// `emote <text>` - freeform third-person action text: "Character <text>."
// to the room, "You <text>." back to the actor. Same trailing-period rule
// as say.js (added only if the text ends in a letter or number, nothing
// else changed) - but unlike say, the text is never capitalized. It isn't
// standing alone in quotes; it's glued straight onto the character's
// name, which already supplies the capital.
//
// Targeting: a token starting with @ names a character (by keyword,
// searched in the room), a token starting with # names an item (by
// keyword, searched in the actor's inventory, then the room floor - same
// order look.js/put.js already search in). Both resolve to that entity's
// real name in the broadcast text; an unresolved @ falls back to
// "someone", an unresolved # to "something", rather than failing the
// whole emote over one bad keyword. This is a separate, simpler mechanism
// from the planned cemote parser (see ARCHITECTURE.md's Combat section) -
// inline references anywhere in free text, not a leading structured
// target argument plus a verb/modifier keyword lexicon.
//
// Known wart, deliberately not fixed here: the actor's own line reuses
// the same text as everyone else's ("You tosses..."), so third-person
// verbs read wrong for "You". Fixing that means conjugating every emote
// per viewer, which isn't a targeting problem - it's the same "You <verb>"
// pattern every other command in the codebase already uses, so it wants
// its own pass across all of them, not a one-off fix just for emote.
const TARGET_TOKEN = /^([@#])(\w+)(.*)$/;

function resolveToken(token, character, room) {
    const match = token.match(TARGET_TOKEN);
    if (!match) {
        return token;
    }

    const [, sigil, keyword, trailing] = match;
    const lowerKeyword = keyword.toLowerCase();

    if (sigil === "@") {
        const target = room.characters.find(c => c.keywords.includes(lowerKeyword));
        return (target ? target.name : "someone") + trailing;
    }

    const item = character.inventory.find(i => i.keywords.includes(lowerKeyword)) ??
        room.inventory.find(i => i.keywords.includes(lowerKeyword));
    return (item ? item.name : "something") + trailing;
}

function addTrailingPeriod(text) {
    return /[a-z0-9]$/i.test(text) ? `${text}.` : text;
}

export const emote = (world, args, character) => {
    if (args.length === 0) {
        return "Emote what?";
    }

    const room = world.getRoomById(character.roomId);
    const text = addTrailingPeriod(
        args.map(token => resolveToken(token, character, room)).join(" ")
    );

    room.characters.forEach(char => {
        if (char !== character && char.socket) {
            writeToSocket(char.socket, `${character.name} ${text}`);
        }
    });

    return `You ${text}`;
};
