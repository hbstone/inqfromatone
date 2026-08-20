import { writeToSocket } from "../utils.js";
import { engageCombat } from "../combat/session.js";
import { keywordMatches } from "../keywordMatch.js";

export const kill = (world, args, character) => {
    const targetName = args.join(" ");
    if (!targetName) {
        return "Kill whom?";
    }

    const room = world.getRoomById(character.roomId);
    const target = room.characters.find(
        char => char !== character && keywordMatches(char.keywords, targetName)
    );

    if (!target) {
        return "You don't see them here.";
    }

    if (!engageCombat(character, target)) {
        return `${target.name} is already defeated.`;
    }

    if (target.socket) {
        writeToSocket(target.socket, `${character.name} attacks you!`);
    }

    return `You attack ${target.name}!`;
};
