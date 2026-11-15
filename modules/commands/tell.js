import { sendTo } from '../utils.js';

export const tell = (world, args, character) => {
    const recipientName = args[0];
    const message = args.slice(1).join(' ');

    if (!recipientName || !message) {
        return 'Usage: tell <character> <message>';
    }

    const recipient = world.findOnlineCharacterByKeyword(recipientName);

    if (!recipient) {
        return `You don't see ${recipientName} online.`;
    }

    // Notify the recipient
    sendTo(recipient, `${character.name} tells you: "${message}"`);

    return `You tell ${recipient.name}: "${message}"`;
};
