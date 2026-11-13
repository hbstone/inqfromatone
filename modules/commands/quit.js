import { writeToSocket } from '../utils.js';
import { nameFor } from '../naming.js';
import { saveWorld } from '../worldPersistence.js';
import { getSession, disengageCombat } from '../combat/session.js';

// Shared by the `quit` command and server.js's socket "close" handler
// (ungraceful disconnect) — both need to leave combat, save, announce the
// departure, and remove the character from their room; only the
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

    // Leave combat first: a fight against someone no longer in the world
    // would otherwise keep running on its timers. If that leaves an
    // opponent with nobody to fight, the session ends for them too (see
    // combat/session.js's checkForSessionEnd) - tell them so.
    const session = getSession(character);
    if (session) {
        const opponents = Array.from(session.participants.keys()).filter((c) => c !== character);
        disengageCombat(character);
        for (const opponent of opponents) {
            if (opponent.socket && !getSession(opponent)) {
                writeToSocket(opponent.socket, `${nameFor(character, opponent)} is gone - you are no longer fighting.`);
            }
        }
    }

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
    // Linkdeath can't be prevented (disconnectCharacter auto-disengages
    // for that), but a deliberate `quit` shouldn't be a free escape from a
    // fight you're losing.
    if (getSession(character)) {
        return "You can't quit in the middle of a fight! Flee or disengage first.";
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
