import { nameFor, tellRoom } from '../naming.js';
import { capitalizeFirst } from '../color.js';
import { endSentence } from '../text.js';

// `say <message>` - IC, broadcasts to the whole room (unlike `tell`,
// which is OOC and direct to one recipient, and `whisper`, which is IC
// but private to one recipient). Deliberately light-touch on the
// message itself: the only two mechanical fixups are capitalizing the
// first letter and adding a trailing period, and only when it ends in a
// letter or number. Any other trailing character is left as typed.
export function formatSpeech(rawMessage) {
    return endSentence(capitalizeFirst(rawMessage));
}

export const say = (world, args, character) => {
    const rawMessage = args.join(' ');
    if (!rawMessage) {
        return 'Say what?';
    }

    const message = formatSpeech(rawMessage);
    const room = world.getRoomById(character.roomId);

    tellRoom(room, (viewer) => `${nameFor(character, viewer)} says, "${message}"`, [character]);

    return `You say, "${message}"`;
};
