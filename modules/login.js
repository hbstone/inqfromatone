// The login/character-creation conversation: name -> password ->
// (new characters only) description. Pulled out of game.js so it can be
// tested against a throwaway World and save directory - game.js loads the
// real world and starts timers on import.
import { stripColors } from "./color.js";
import { look } from "./commands/look.js";
import { initializeCharacterStats } from "./content/loadStatDefinitions.js";
import { findInWorldCharacter, takeOverConnection } from "./connection.js";
import { writeToSocket } from "./utils.js";
import { hashPassword, verifyPassword } from "./auth.js";
import { characterExists, loadCharacterState, saveCharacterState } from "../data.js";

// Letters and spaces only: character names become part of a filesystem
// path (see data.js), so this is a real allowlist, not just cosmetic.
const NAME_PATTERN = /^[A-Za-z][A-Za-z ]{1,31}$/;

// Wrong passwords allowed per connection before it's closed - a cheap
// brake on someone scripting guesses over telnet.
const MAX_PASSWORD_ATTEMPTS = 3;

/**
 * Build the login handler for one world.
 * @param {{ world: import("./World.js").World, startingRoomKey: string, charactersDir?: string }} options -
 *   charactersDir is overridable for tests.
 * @returns {(socket: object, input: string) => (string|undefined)}
 */
export function createLoginHandler({ world, startingRoomKey, charactersDir }) {
    return function handleLogin(socket, input) {
        const character = socket.character;

        // Handle name input
        if (character.stage === "name") {
            // Color codes are welcome in most input/output (see modules/color.js),
            // but not here: the name becomes a filename and a keyword-matching
            // key (data.js, Character#setName), so it needs to stay within
            // NAME_PATTERN's plain letters-and-spaces allowlist. Stripping
            // first - rather than rejecting outright - means a name typed or
            // pasted with color codes in it still goes through, just without
            // them, instead of failing on a confusing "letters and spaces only"
            // error.
            const stripped = stripColors(input);

            if (!stripped) {
                return "Name cannot be blank. Please enter your character's name:";
            }

            // Only the first letter - "rhaehan" becomes "Rhaehan", but a
            // deliberately-lowercase second word (e.g. a last name) is left
            // exactly as typed, not title-cased.
            const name = stripped.charAt(0).toUpperCase() + stripped.slice(1);

            if (!NAME_PATTERN.test(name)) {
                return "Names may only contain letters and spaces (2-32 characters). Please enter your character's name:";
            }

            if (characterExists(name, charactersDir)) {
                character.setName(name);
                character.stage = "password";
                return "Enter your password:";
            } else {
                character.setName(name);
                character.stage = "password";
                character.new = true;
                return "Creating a new character. Enter a password:";
            }
        }

        // Handle password input
        if (character.stage === "password") {
            if (!input) {
                return "Password cannot be blank. Please enter your password:";
            }

            // A new character's password is only held in memory until the
            // description step finishes - nothing is written to disk until
            // the character is complete, so a dropped connection mid-creation
            // can't leave a half-made save behind.
            if (character.new) {
                character.pendingPasswordHash = hashPassword(input);
                character.stage = "description";
                return "Enter a description for your character:";
            }

            const saved = loadCharacterState(character.name, charactersDir);
            if (!saved) {
                // characterExists said yes at the name stage, so the file's
                // there but unreadable - say so, rather than "Incorrect
                // password" forever.
                console.error(`Login failed for "${character.name}": save file unreadable.`);
                character.stage = "name";
                return "Your character's save file couldn't be loaded - please let an admin know. Enter a name:";
            }

            const { ok, needsRehash } = verifyPassword(input, saved.password);
            if (!ok) {
                character.failedPasswordAttempts = (character.failedPasswordAttempts ?? 0) + 1;
                if (character.failedPasswordAttempts >= MAX_PASSWORD_ATTEMPTS) {
                    console.warn(`Closing connection after ${MAX_PASSWORD_ATTEMPTS} wrong passwords for "${character.name}".`);
                    character.stage = "closed"; // matches no stage below, so anything else sent before the socket closes is ignored
                    writeToSocket(socket, "Too many incorrect passwords. Goodbye.");
                    socket.end();
                    return;
                }
                return "Incorrect password. Try again:";
            }

            // Upgrade a legacy (unsalted SHA-256) or weaker-parameter hash in
            // place, now that we have the plaintext to rehash - see auth.js.
            if (needsRehash) {
                saved.password = hashPassword(input);
                saveCharacterState(character.name, saved, charactersDir);
            }

            // A save from before creation was deferred to the end (password
            // written, description never entered): pick creation back up
            // rather than logging in a character with no stats.
            if (saved.description == null) {
                character.pendingPasswordHash = saved.password;
                character.resumingCreation = true;
                character.stage = "description";
                return "Your character was never finished. Enter a description for your character:";
            }

            // Already online (another connection, or a dropped one the server
            // hasn't noticed yet)? Take that live character over rather than
            // loading a second copy from disk.
            const online = findInWorldCharacter(world, character.name);
            if (online) {
                takeOverConnection(online, socket);
                return `Reconnected as ${online.name}.\n\n${look(world, [], online)}`;
            }

            character.isLoggedIn = true;
            character.stage = null;

            character.restoreFrom(saved);
            const room = world.getRoomById(saved.roomId) ?? world.getRoomById(startingRoomKey);
            room.addCharacter(character);

            return `Welcome back, ${character.name}!\n\n${look(world, [], character)}`;
        }

        // Handle description input
        if (character.stage === "description") {
            if (!input) {
                return "Description cannot be blank. Please enter a description for your character:";
            }

            // Nothing was reserved on disk at the name step, so two
            // connections can both be partway through creating the same new
            // name. Whoever finishes first gets it.
            if (!character.resumingCreation && characterExists(character.name, charactersDir)) {
                character.new = false;
                character.pendingPasswordHash = null;
                character.stage = "name";
                return "Someone just finished creating a character with that name. Please choose another name:";
            }

            character.description = input;
            character.isLoggedIn = true;
            character.stage = null;
            initializeCharacterStats(character);

            saveCharacterState(character.name, { password: character.pendingPasswordHash, ...character.toSaveData() }, charactersDir);
            character.pendingPasswordHash = null;
            character.resumingCreation = false;
            character.new = false;

            world.getRoomById(startingRoomKey).addCharacter(character);

            return `Welcome, ${character.name}! Your description: "${input}"\n\n${look(world, [], character)}`;
        }
    };
}
