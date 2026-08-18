import { World } from "./modules/World.js";
import { getCommand } from "./modules/commands/registry.js";
import "./modules/commands/index.js"; // registers the built-in verbs, see index.js
import { emit } from "./modules/events.js";
import { loadWorldData } from "./modules/content/loadWorldData.js";
import { disconnectCharacter } from "./modules/commands/quit.js";
import crypto from "crypto";
import { characterExists, loadCharacterState, saveCharacterState } from "./data.js";

const world = new World(); // Initialize the world
const { startingRoomKey } = loadWorldData(world); // Load room/item content data

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
        if (!input) {
            return "Name cannot be blank. Please enter your character's name:";
        }
        if (!NAME_PATTERN.test(input)) {
            return "Names may only contain letters and spaces (2-32 characters). Please enter your character's name:";
        }

        if (characterExists(input)) {
            character.setName(input);
            character.stage = "password";
            return "Enter your password:";
        } else {
            character.setName(input);
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
        if (saved && saved.password === hashedPassword) {
            character.isLoggedIn = true;
            character.stage = null;

            character.restoreFrom(saved);
            const room = world.getRoomById(saved.roomId) ?? world.getRoomById(startingRoomKey);
            room.addCharacter(character);

            return `Welcome back, ${character.name}!`;
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

        const saved = loadCharacterState(character.name) ?? {};
        saveCharacterState(character.name, { ...saved, ...character.toSaveData() });

        world.getRoomById(startingRoomKey).addCharacter(character);

        return `Welcome, ${character.name}! Your description: "${input}"`;
    }
}

export const handleCommand = (socket, input) => {
    const character = socket.character;

    if (!character.isLoggedIn) {
        return handleLogin(socket, input);
    }

    const [command, ...args] = input.trim().split(/\s+/);
    const handler = getCommand(command);
    if (handler) {
        const result = handler(world, args, character, socket);
        emit("command", { character, command, args, result, world });
        return result;
    }

    return "I don't understand that command.";
};

// Called on an ungraceful disconnect (socket "end" without the player
// typing `quit`) so their state still gets saved and their room still
// gets cleaned up, instead of leaving a stale entry in room.characters.
export const handleDisconnect = (socket) => {
    const character = socket.character;
    if (character.isLoggedIn) {
        disconnectCharacter(world, character, `${character.name} has disconnected.`);
    }
};
