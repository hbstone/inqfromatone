import { writeToSocket } from "../utils.js";
import { getSession, disengageCombat } from "../combat/session.js";

export const disengage = (world, args, character) => {
    const session = getSession(character);
    if (!session) {
        return "You aren't fighting anyone.";
    }

    const others = Array.from(session.participants.keys()).filter(c => c !== character);
    disengageCombat(character);

    others.forEach(other => {
        if (other.socket) {
            writeToSocket(other.socket, `${character.name} disengages from combat.`);
        }
    });

    return "You disengage from combat.";
};
