// `tip [someone]` - tip your hat, to the room or to one person. Uses
// whatever's in the head slot ("You tip your dusty stetson to ..."); with
// nothing there, a touch of two fingers to the brow stands in.
import { findCharacter, nameFor, tellRoom } from '../../../modules/naming.js';

// "a dusty stetson" -> "dusty stetson", to read as "your dusty stetson"
function bareName(item) {
    return item.name.replace(/^(a|an|the|some)\s+/i, '');
}

export const tip = (world, args, character) => {
    const room = world.getRoomById(character.roomId);
    const hat = character.equipment?.head;
    const gesture = hat
        ? { you: `tip your ${bareName(hat)}`, they: `tips their ${bareName(hat)}` }
        : { you: 'touch two fingers to your brow', they: 'touches two fingers to their brow' };

    const targetName = args[0];
    if (!targetName) {
        tellRoom(room, (viewer) => `${nameFor(character, viewer)} ${gesture.they}.`, [character]);
        return `You ${gesture.you}.`;
    }

    const others = room.others(character);
    const target = findCharacter(character, others, targetName);
    if (!target) {
        return `You don't see ${targetName} here.`;
    }

    tellRoom(
        room,
        (viewer) =>
            `${nameFor(character, viewer)} ${gesture.they} to ${viewer === target ? 'you' : nameFor(target, viewer)}.`,
        [character],
    );
    return `You ${gesture.you} to ${nameFor(target, character)}.`;
};
