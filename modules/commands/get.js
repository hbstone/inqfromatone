export const get = (game, args, player) => {
    const keyword = args[0];
    const { room } = player;

    if (!keyword) {
        return "What do you want to get?";
    }

    // Search the room's inventory for the item
    const itemIndex = room.inventory.findIndex(item =>
        item.keywords.includes(keyword)
    );

    if (itemIndex === -1) {
        return "You can't find that here.";
    }

    // Move the item to the player's inventory
    const [item] = room.inventory.splice(itemIndex, 1);
    player.inventory.push(item);

    return `You pick up ${item.name}.`;
};
