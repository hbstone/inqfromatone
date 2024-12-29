import { writeToSocket } from "../utils.js";

export const whisper = (world, args, character) => {
    const recipientName = args[0];
    const message = args.slice(1).join(" ");
    const room = world.getRoomById(character.roomId);

    if (!recipientName || !message) {
        return "Usage: whisper <character> <message>";
    }

    const recipient = room.characters.find(char =>
        char.keywords.includes(recipientName.toLowerCase())
    );

    if (!recipient) {
        return `You don't see ${recipientName} here.`;
    }

    // Notify the recipient
    if (recipient.socket) {
        writeToSocket(
            recipient.socket,
            `${character.name} whispers to you, "${message}"`
        );
    }

    return `You whisper to ${recipient.name}: "${message}"`;
};
