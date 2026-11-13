import { writeToSocket } from '../utils.js';
import { findCharacter, nameFor, tellRoom } from '../naming.js';
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

    // Notify the recipient
    if (recipient.socket) {
        writeToSocket(recipient.socket, `${nameFor(character, recipient)} gives you ${message}.`);
    }

    // Broadcast the action to the room
    tellRoom(room, (viewer) => `${nameFor(character, viewer)} gives ${message} to ${nameFor(recipient, viewer)}.`, [
        character,
        recipient,
    ]);

    return `You give ${message} to ${nameFor(recipient, character)}.`;
};
