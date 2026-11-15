import { sendTo } from '../../../modules/utils.js';
import { nameFor } from '../../../modules/naming.js';
import { getSession, disengageCombat } from './session.js';

export const disengage = (world, args, character) => {
    const session = getSession(character);
    if (!session) {
        return "You aren't fighting anyone.";
    }

    const others = Array.from(session.participants.keys()).filter((c) => c !== character);
    disengageCombat(character);

    others.forEach((other) => {
        sendTo(other, `${nameFor(character, other)} disengages from combat.`);
    });

    return 'You disengage from combat.';
};
