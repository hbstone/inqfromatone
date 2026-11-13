import { writeToSocket } from '../../../modules/utils.js';
import { findCharacter, nameFor } from '../../../modules/naming.js';
import { engageCombat } from './session.js';

export const kill = (world, args, character) => {
    const targetName = args.join(' ');
    if (!targetName) {
        return 'Kill whom?';
    }

    const room = world.getRoomById(character.roomId);
    const target = findCharacter(
        character,
        room.characters.filter((c) => c !== character),
        targetName,
    );

    if (!target) {
        return "You don't see them here.";
    }

    // Core NPCs are non-combat for now (see ARCHITECTURE.md's "NPCs")
    if (target.isNpc) {
        return `You can't attack ${nameFor(target, character)}.`;
    }

    if (!engageCombat(character, target)) {
        return `${nameFor(target, character)} is already defeated.`;
    }

    if (target.socket) {
        writeToSocket(target.socket, `${nameFor(character, target)} attacks you!`);
    }

    return `You attack ${nameFor(target, character)}!`;
};
