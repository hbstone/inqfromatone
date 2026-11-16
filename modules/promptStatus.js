// Short statuses shown in a player's prompt, like "[sneaking] > ". Packs
// register what they want shown; a first step toward a prompt players can
// customize (hp, room name, time of day...).

const statuses = [];

/**
 * @param {(character: object) => string|null|undefined} status - A short
 *   word or two to show now, or nothing.
 */
export function registerPromptStatus(status) {
    statuses.push(status);
}

/**
 * @param {object} character
 * @returns {string[]} What to show for them now, in registration order.
 */
export function promptStatusesFor(character) {
    return statuses.map((status) => status(character)).filter(Boolean);
}
