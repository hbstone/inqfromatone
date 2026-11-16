import { tellRoomNoticing } from '../notice.js';
import { findCharacter, nameFor } from '../naming.js';
import { resolveItemToken, formatItemList, previewMatch } from '../itemSearch.js';
import { moveMatches } from '../stacking.js';

export const give = (world, args, character) => {
    const itemToken = args[0];
    const recipientName = args.slice(1).join(' ').replace(/^to /i, '');
    const room = world.getRoomById(character.roomId);

    if (!itemToken || !recipientName) {
        return 'Usage: give (keyword) [to] (target)';
    }

    const { matches, error } = resolveItemToken(itemToken, [character.inventory]);
    if (error) {
        return error;
    }
    if (matches.length === 0) {
        return "You can't find that.";
    }

    // Find the recipient in the current room
    const recipient = findCharacter(character, room.characters, recipientName);

    if (!recipient) {
        return "You can't find them.";
    }

    // NPCs aren't saved, so anything handed to one would vanish at the
    // next restart (see ARCHITECTURE.md's "NPCs")
    if (recipient.isNpc) {
        return `${nameFor(recipient, character)} doesn't take it.`;
    }

    const message = formatItemList(matches.map(previewMatch));
    moveMatches(matches, recipient.inventory);

    // The recipient and the room, each if they notice (see
    // modules/notice.js): someone sneaking can slip a thing into a pocket
    // unnoticed.
    tellRoomNoticing(room, character, 'give', (viewer) =>
        viewer === recipient
            ? `${nameFor(character, recipient)} gives you ${message}.`
            : `${nameFor(character, viewer)} gives ${message} to ${nameFor(recipient, viewer)}.`,
    );

    return `You give ${message} to ${nameFor(recipient, character)}.`;
};
