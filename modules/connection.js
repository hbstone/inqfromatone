// Binding between a socket and the character it's playing. Normally that's
// fixed for a connection's whole life (server.js gives every new socket a
// fresh, not-yet-logged-in Character), but logging into a character who's
// already online moves that character onto the new socket instead.
import { Character } from './Character.js';
import { writeToSocket } from './utils.js';

/**
 * Find the in-world character with exactly this name (case-insensitive),
 * if they're online. Deliberately exact, not World's fuzzy keyword
 * lookup: "Bo" logging in must never resolve to an online "Bob".
 * @param {import("./World.js").World} world
 * @param {string} name
 * @returns {Character|null}
 */
export function findInWorldCharacter(world, name) {
    const wanted = name.toLowerCase();
    for (const room of world.getAllRooms()) {
        // NPCs aren't logins: a player named like one mustn't take it over
        const found = room.characters.find((c) => !c.isNpc && c.name?.toLowerCase() === wanted);
        if (found) {
            return found;
        }
    }
    return null;
}

/**
 * Move an already-online character onto a new connection, closing the old
 * one. The live in-world character is kept as-is - room, inventory,
 * combat, everything - rather than reloaded from disk, since the live
 * state is newer than any save and a second copy loaded alongside it is
 * exactly the duplication bug this exists to prevent.
 *
 * The old socket gets a fresh placeholder character (not logged in, no
 * login stage) so any input still arriving on it is ignored, and so its
 * close event doesn't disconnect the character who's moved on (see
 * game.js's handleDisconnect).
 * @param {Character} character - The online character being taken over.
 * @param {import("net").Socket} newSocket
 */
export function takeOverConnection(character, newSocket) {
    const oldSocket = character.socket;

    character.socket = newSocket;
    newSocket.character = character;

    if (oldSocket && oldSocket !== newSocket) {
        writeToSocket(oldSocket, 'This character has been logged in from another connection. Goodbye.');
        const placeholder = new Character();
        placeholder.stage = null;
        placeholder.colorEnabled = character.colorEnabled;
        oldSocket.character = placeholder;
        oldSocket.end();
    }
}
