import { writeToSocket } from "../utils.js";
import { resolveItemToken, formatItemList } from "../itemSearch.js";
import { keywordMatches } from "../keywordMatch.js";

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
// order look.js/put.js already search in), including their 2.x/N*x
// qualifiers (see itemSearch.js) - "tosses #half" or "tosses #3*brick"
// both work. Both resolve to the entity's real name (or, for a cardinal
// #, the same grouped "xN" list get/put use) in the broadcast text.
// Matching is fuzzy/substring (see keywordMatch.js) - "@bae" or "#bri"
// work the same as the full keyword would.
//
// Two different failure modes for two different mistakes: an unqualified
// @/# that finds nothing falls back to "someone"/"something" - a typo in
// otherwise-fine freeform text shouldn't nuke the whole emote. A
// qualified # that asks for more than exists (2.pouch with only one
// around, 3*brick with only two) fails the *entire* emote instead -
// nothing broadcasts, the actor just gets the "there aren't N things
// matching..." message - since that's a deliberate, specific request
// that plainly can't be satisfied, not a vague reference to paper over.
// @ has no qualifiers yet (see ARCHITECTURE.md) - only # does.
//
// This is a separate, simpler mechanism from the planned cemote parser
// (see ARCHITECTURE.md's Combat section) - inline references anywhere in
// free text, not a leading structured target argument plus a
// verb/modifier keyword lexicon.
//
// Known wart, deliberately not fixed here: the actor's own line reuses
// the same text as everyone else's ("You tosses..."), so third-person
// verbs read wrong for "You". Fixing that means conjugating every emote
// per viewer, which isn't a targeting problem - it's the same "You <verb>"
// pattern every other command in the codebase already uses, so it wants
// its own pass across all of them, not a one-off fix just for emote.
const TARGET_TOKEN = /^([@#])((?:\d+[.*])?\w+)(.*)$/;

// Resolves one token. Returns { text } on success (including the
// "someone"/"something" fallback) or { error } when a qualified # asked
// for more than exists - the caller aborts the whole emote on that.
function resolveToken(token, character, room) {
    const match = token.match(TARGET_TOKEN);
    if (!match) {
        return { text: token };
    }

    const [, sigil, keywordToken, trailing] = match;

    if (sigil === "@") {
        // No ordinal/cardinal for @ yet - plain (fuzzy) keyword only.
        const target = room.characters.find(c => keywordMatches(c.keywords, keywordToken));
        return { text: (target ? target.name : "someone") + trailing };
    }

    const { matches, error } = resolveItemToken(keywordToken, [character.inventory, room.inventory]);
    if (error) {
        return { error };
    }
    if (matches.length === 0) {
        return { text: "something" + trailing };
    }
    return { text: formatItemList(matches.map(m => m.item)) + trailing };
}

function addTrailingPeriod(text) {
    return /[a-z0-9]$/i.test(text) ? `${text}.` : text;
}

export const emote = (world, args, character) => {
    if (args.length === 0) {
        return "Emote what?";
    }

    const room = world.getRoomById(character.roomId);
    const resolvedTokens = [];
    for (const token of args) {
        const resolved = resolveToken(token, character, room);
        if (resolved.error) {
            return resolved.error;
        }
        resolvedTokens.push(resolved.text);
    }

    const text = addTrailingPeriod(resolvedTokens.join(" "));

    room.characters.forEach(char => {
        if (char !== character && char.socket) {
            writeToSocket(char.socket, `${character.name} ${text}`);
        }
    });

    return `You ${text}`;
};
