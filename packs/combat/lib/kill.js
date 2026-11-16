import { sendTo } from '../../../modules/utils.js';
import { findCharacter, nameFor } from '../../../modules/naming.js';
import { engageCombat, getSession } from './session.js';
import { adjustSentiment, seesAndRemembers } from '../../../modules/npcs/relationships.js';

// How much starting a fight costs you with each NPC that sees it (see
// modules/npcs/relationships.js).
export const STARTED_A_FIGHT = -2;

export const kill = (world, args, character) => {
    const targetName = args.join(' ');
    if (!targetName) {
        return 'Kill whom?';
    }

    const room = world.getRoomById(character.roomId);
    const target = findCharacter(character, room.others(character), targetName);

    if (!target) {
        return "You don't see them here.";
    }

    // Core NPCs are non-combat for now (see ARCHITECTURE.md's "NPCs")
    if (target.isNpc) {
        return `You can't attack ${nameFor(target, character)}.`;
    }

    const alreadyFighting = getSession(character) && getSession(character) === getSession(target);
    if (!engageCombat(character, target)) {
        return `${nameFor(target, character)} is already defeated.`;
    }

    // Starting trouble is remembered by the NPCs who see it, unless they
    // keep no knowledge at all (the dog).
    if (!alreadyFighting) {
        for (const npc of room.others(character)) {
            if (seesAndRemembers(npc)) {
                adjustSentiment(npc, character, STARTED_A_FIGHT, 'started a fight here');
            }
        }
    }

    sendTo(target, `${nameFor(character, target)} attacks you!`);

    return `You attack ${nameFor(target, character)}!`;
};
