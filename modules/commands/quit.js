import { writeToSocket } from '../utils.js';
import { saveWorld } from '../worldPersistence.js';
import { emit } from '../events.js';

// Packs can stop a deliberate `quit` (combat refuses it mid-fight) by
// registering a check that returns a reason, or null to allow it. Only
// `quit` asks: a dropped connection can't be refused, so packs clean up on
// the "characterLeaving" event instead (see disconnectCharacter).
const quitBlockers = [];

/**
 * @param {(character: object) => (string|null)} check - Returns the
 *   message to show instead of quitting, or null if quitting is fine.
 */
export function registerQuitBlocker(check) {
    quitBlockers.push(check);
}

// Shared by the `quit` command and server.js's socket "close" handler
// (ungraceful disconnect) — both need to let packs clean up, save, announce
// the departure, and remove the character from their room; only the
// socket-closing bit at the end of `quit` below is specific to a graceful
// quit.
/**
 * @param {import("../World.js").World} world
 * @param {import("../Character.js").Character} character
 * @param {string} departureMessage - Broadcast to the rest of the room.
 * @param {{ roomsDir?: string, charactersDir?: string }} [saveDirs] -
 *   Passed through to saveWorld; overridable for tests.
 */
export const disconnectCharacter = (world, character, departureMessage, saveDirs) => {
    const room = world.getRoomById(character.roomId);
    if (!room) {
        // Already cleaned up (e.g. `quit`'s own socket.end() below re-fires
        // the socket's close event) - nothing left to do.
        return;
    }

    // Anything a pack keeps running for this character (a fight, a crafting
    // loop) ends here, before the save, so none of it outlives them or
    // lands in their save file. Combat uses this to end their fight.
    emit('characterLeaving', { character, room, world });

    // Broadcast to the room about the disconnection
    room.characters.forEach((char) => {
        if (char !== character && char.socket) {
            writeToSocket(char.socket, departureMessage);
        }
    });

    // A full checkpoint, not just this character: anything they moved
    // to/from a room since the last periodic save needs the room side saved
    // in the same pass (see modules/worldPersistence.js). Done before
    // removing them from the room, so they're included and their saved
    // roomId reflects where they actually were.
    saveWorld(world, saveDirs);

    room.removeCharacter(character);
    character.presence = null; // not saved anyway; cleared for a takeover-free reconnect too (see modules/presence.js)
};

export const quit = (world, args, character, socket) => {
    for (const check of quitBlockers) {
        const reason = check(character);
        if (reason) {
            return reason;
        }
    }

    disconnectCharacter(world, character, `${character.name} has left the game.`);
    character.isLoggedIn = false; // so the close event this triggers below doesn't clean up twice

    // Socket cleanup
    socket.write('Disconnecting...'); // send the closing message separately...
    setTimeout(() => {
        // ...so that the client has some time to process and display it...
        socket.end(); // ... before closing the connection.
    }, 500);
};
