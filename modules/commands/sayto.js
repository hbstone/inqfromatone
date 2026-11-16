// `sayto <someone> <message>` - say something to one person, out loud. The
// room hears it (unlike `whisper`) and sees who it was meant for:
//
//   You say to a mustachioed bartender, "The stage is running late."
//   A mustachioed bartender nods.
//
// An NPC that keeps hearsay remembers it and can repeat it when asked (see
// modules/npcs/knowledge.js); only what's said straight to it counts, not
// talk it happens to be near. Whispers aren't taken in for now: something
// said in confidence shouldn't be passed on to anyone who asks.
import { capitalizeFirst } from '../color.js';
import { findCharacter, nameFor, tellRoom } from '../naming.js';
import { answerLines, hearTold } from '../npcs/dialogue.js';
import { formatSpeech } from './say.js';

const USAGE = 'Usage: sayto <someone> <message>';

export const sayto = (world, args, character) => {
    const [targetName, ...rest] = args;
    const raw = rest.join(' ').trim();
    if (!targetName || !raw) {
        return USAGE;
    }
    const room = world.getRoomById(character.roomId);
    const target = findCharacter(character, room.others(character), targetName);
    if (!target) {
        return `You don't see ${targetName} here.`;
    }

    const message = formatSpeech(raw);
    const reaction = target.isNpc ? hearTold(target, character, message) : null;
    // One block per viewer: the line, then the NPC's reaction, if any.
    const block = (line, viewer) =>
        [line, ...(reaction ? answerLines(target, reaction, viewer) : [])].map(capitalizeFirst).join('\n');

    tellRoom(
        room,
        (viewer) =>
            block(
                `${nameFor(character, viewer)} says to ${viewer === target ? 'you' : nameFor(target, viewer)}, "${message}"`,
                viewer,
            ),
        [character],
    );
    return block(`You say to ${nameFor(target, character)}, "${message}"`, character);
};
