// `ask <someone> about <topic>` ("about" is optional). The room sees the
// question. An NPC answers from the topics in its content (see
// modules/npcs/dialogue.js); a player answers however they like, with say.
import { capitalizeFirst } from '../color.js';
import { findCharacter, nameFor, tellRoom } from '../naming.js';
import { answerFor, answerLines } from '../npcs/dialogue.js';

const USAGE = 'Usage: ask <someone> about <topic>';

export const ask = (world, args, character) => {
    const [targetName, ...rest] = args;
    const topicWords = rest[0]?.toLowerCase() === 'about' ? rest.slice(1) : rest;
    // As typed, minus closing punctuation: "the card game?" -> "the card game"
    const topic = topicWords.join(' ').replace(/[\s?.!]+$/, '');
    if (!targetName) {
        return USAGE;
    }

    const room = world.getRoomById(character.roomId);
    const others = room.others(character);
    const target = findCharacter(character, others, targetName);
    if (!target) {
        return `You don't see ${targetName} here.`;
    }
    if (!topic) {
        return `Ask ${nameFor(target, character)} about what?`;
    }

    const answer = target.isNpc ? answerFor(target, topic, { asker: character, room }) : null;
    // One block per viewer: the question, then the NPC's answer, if any.
    const block = (question, viewer) =>
        [question, ...(answer ? answerLines(target, answer, viewer) : [])].map(capitalizeFirst).join('\n');

    tellRoom(
        room,
        (viewer) =>
            block(
                `${nameFor(character, viewer)} asks ${viewer === target ? 'you' : nameFor(target, viewer)} about ${topic}.`,
                viewer,
            ),
        [character],
    );
    return block(`You ask ${nameFor(target, character)} about ${topic}.`, character);
};
