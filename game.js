import { World } from "./modules/World.js";
import { getCommand } from "./modules/commands/registry.js";
import "./modules/commands/index.js"; // registers the built-in verbs, see index.js
import { emit } from "./modules/events.js";
import crypto from "crypto";
import { loadCharacters, saveCharacters } from "./data.js";

const world = new World(); // Initialize the world
const characters = loadCharacters(); // Load saved characters

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

        if (characters[input]) {
            character.name = input;
            character.stage = "password";
            return "Enter your password:";
        } else {
            character.name = input;
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
            characters[character.name] = { password: hashedPassword };
            saveCharacters(characters);
            character.stage = "description";
            return "Enter a description for your character:";
        }

        if (characters[character.name].password === hashedPassword) {
            character.isLoggedIn = true;
            character.stage = null;

            // Retrieve or create the "Starting Room"
            let startingRoom = world.getRoomByName("Starting Room");
            if (!startingRoom) {
                const roomId = world.addRoom("Starting Room", "A simple starting room.");
                startingRoom = world.getRoomById(roomId);
            }

            startingRoom.characters.push(character);
            character.roomId = startingRoom.id; // Store the room ID in the character

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

        characters[character.name].description = input;
        saveCharacters(characters);
        character.isLoggedIn = true;
        character.stage = null;

        // Retrieve or create the "Starting Room"
        let startingRoom = world.getRoomByName("Starting Room");
        if (!startingRoom) {
            const roomId = world.addRoom("Starting Room", "A simple starting room.");
            startingRoom = world.getRoomById(roomId);
        }

        startingRoom.characters.push(character);
        character.roomId = startingRoom.id; // Store the room ID in the character

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
