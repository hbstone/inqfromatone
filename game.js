import { World } from "./modules/World.js";
import { getCommand } from "./modules/commands/registry.js";
import { look } from "./modules/commands/look.js";
import { stripColors } from "./modules/color.js";
import "./modules/commands/index.js"; // registers the built-in verbs, see index.js
import "./modules/checks/index.js"; // registers the default check resolver, see index.js
import { setWorld as setCombatWorld } from "./modules/combat/index.js"; // registers the unarmed attack producer + combat messages, see index.js
import { startRegenTicker } from "./modules/combat/regen.js";
import { emit } from "./modules/events.js";
import { loadWorldData } from "./modules/content/loadWorldData.js";
import { loadStatDefinitions, initializeCharacterStats } from "./modules/content/loadStatDefinitions.js";
import { disconnectCharacter } from "./modules/commands/quit.js";
import { loadRoomStates, saveWorld, startWorldSaveTicker } from "./modules/worldPersistence.js";
import { findInWorldCharacter, takeOverConnection } from "./modules/connection.js";
import { guard } from "./modules/guard.js";
import { writeToSocket } from "./modules/utils.js";
import crypto from "crypto";
import { characterExists, loadCharacterState, saveCharacterState } from "./data.js";

const world = new World(); // Initialize the world
const { startingRoomKey } = loadWorldData(world); // Load room/item content data
loadRoomStates(world); // Overlay any saved room state (dropped/placed items) onto the content defaults
loadStatDefinitions(); // Load stat definitions (which stats exist, starting values, roles)
setCombatWorld(world); // let combat messages reach room bystanders, not just the two combatants
startRegenTicker(world); // passive vitality regen for every online character
startWorldSaveTicker(world); // periodic checkpoint: dirty rooms + every in-world character (see worldPersistence.js)

/**
 * Called from server.js when the process is about to exit - a graceful
 * SIGINT/SIGTERM, or a fatal error - so whatever's changed since the last
 * periodic checkpoint isn't lost. Tells everyone online first.
 * @param {string} message - What to tell connected players.
 */
export const saveWorldOnShutdown = (message) => {
    for (const character of world.getOnlineCharacters()) {
        guard("shutdown notice", () => writeToSocket(character.socket, message));
    }
    saveWorld(world);
};

// Letters and spaces only: character names become part of a filesystem
// path (see data.js), so this is a real allowlist, not just cosmetic.
const NAME_PATTERN = /^[A-Za-z][A-Za-z ]{1,31}$/;

function hashPassword(password) {
    return crypto.createHash("sha256").update(password).digest("hex");
}

function handleLogin(socket, input) {
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

        if (characterExists(name)) {
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

        const hashedPassword = hashPassword(input);

        if (character.new) {
            saveCharacterState(character.name, { password: hashedPassword });
            character.stage = "description";
            return "Enter a description for your character:";
        }

        const saved = loadCharacterState(character.name);
        if (!saved) {
            // characterExists said yes at the name stage, so the file's
            // there but unreadable - say so, rather than "Incorrect
            // password" forever.
            console.error(`Login failed for "${character.name}": save file unreadable.`);
            character.stage = "name";
            return "Your character's save file couldn't be loaded - please let an admin know. Enter a name:";
        }
        if (saved.password === hashedPassword) {
            // Already online (another connection, or a dropped one the
            // server hasn't noticed yet)? Take that live character over
            // rather than loading a second copy from disk.
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
        } else {
            return "Incorrect password. Try again:";
        }
    }

    // Handle description input
    if (character.stage === "description") {
        if (!input) {
            return "Description cannot be blank. Please enter a description for your character:";
        }

        character.description = input;
        character.isLoggedIn = true;
        character.stage = null;
        initializeCharacterStats(character);

        const saved = loadCharacterState(character.name) ?? {};
        saveCharacterState(character.name, { ...saved, ...character.toSaveData() });

        world.getRoomById(startingRoomKey).addCharacter(character);

        return `Welcome, ${character.name}! Your description: "${input}"\n\n${look(world, [], character)}`;
    }
}

const COMMAND_ERROR = "Something went wrong running that command. It's been logged.";

export const handleCommand = (socket, input) => {
    const character = socket.character;

    if (!character.isLoggedIn) {
        return guard(`login for socket ${socket.remoteAddress ?? "?"}`, () => handleLogin(socket, input), COMMAND_ERROR);
    }

    const [command, ...args] = input.trim().split(/\s+/);
    const handler = getCommand(command);
    if (handler) {
        // A bug in one command costs that one command, not the server -
        // see modules/guard.js.
        const result = guard(`command "${input}" from ${character.name}`, () => handler(world, args, character, socket), COMMAND_ERROR);
        emit("command", { character, command, args, result, world });
        return result;
    }

    return "I don't understand that command.";
};

// Called whenever a socket closes. For an ungraceful disconnect (no
// `quit`) this still saves the character and cleans up their room,
// instead of leaving a stale entry in room.characters. Skipped if the
// character has since moved to another connection (see
// modules/connection.js) - this socket closing doesn't mean they left.
export const handleDisconnect = (socket) => {
    const character = socket.character;
    if (character.isLoggedIn && character.socket === socket) {
        disconnectCharacter(world, character, `${character.name} has disconnected.`);
    }
};
