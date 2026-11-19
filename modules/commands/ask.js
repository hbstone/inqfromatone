// `ask <someone> about <topic>` ("about" is optional). The room sees the
// question. An NPC answers from the topics in its content (see
// modules/npcs/dialogue.js); a player answers however they like, with say.
//
// A question the NPC escalates to a higher brain tier (see
// modules/npcs/switchboard.js) is answered when that tier is done: the room
// sees the question now and the answer a moment later, as long as the NPC
// and the asker are both still there to have the conversation. Then the
// NPC remembers what it said (see modules/npcs/knowledge.js).
import { capitalizeFirst } from '../color.js';
import { guard } from '../guard.js';
import { findCharacter, nameFor, tellRoom } from '../naming.js';
import { answerFor, answerLines } from '../npcs/dialogue.js';
import { rememberSaid } from '../npcs/knowledge.js';

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

    const reply = target.isNpc ? answerFor(target, topic, { asker: character, room }) : null;
    const answer = reply?.pending ? null : reply;
    if (reply?.pending) {
        reply.pending.then((later) => guard(`answer from ${target.templateId}`, () => deliverLater(later)));
    }

    // One block per viewer: the question, then the NPC's answer, if any.
    const block = (question, viewer) =>
        [question, ...(answer ? answerLines(target, answer, viewer) : [])].map(capitalizeFirst).join('\n');

    // An answer that took a while: to everyone in the room, asker included.
    // One the higher tier wrote, the NPC remembers saying.
    function deliverLater(later) {
        const here = (c) => c.roomId === room.id && room.characters.includes(c);
        if (here(target) && here(character)) {
            tellRoom(room, (viewer) => answerLines(target, later, viewer).map(capitalizeFirst).join('\n'));
            if (later.higherTier) {
                rememberSaid(target, character, topic, later, later.higherTier.drewOn);
            }
        }
    }

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
