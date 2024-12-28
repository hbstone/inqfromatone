const { world } = require('./world');
const { writeToSocket, broadcast } = require('./utils');
const { loadCharacters, saveCharacters } = require('./data');
const crypto = require('crypto');

function handleLogin(socket, input) {
    const characters = loadCharacters();
    if (!input) {
        writeToSocket(socket, "Name cannot be blank. Please enter your character's name:");
        return;
    }

    if (characters[input]) {
        socket.character.name = input;
        socket.character.stage = 'password';
        writeToSocket(socket, "Enter your password:");
    } else {
        socket.character.name = input;
        socket.character.stage = 'password';
        socket.character.new = true;
        writeToSocket(socket, "Creating a new character. Enter a password:");
    }
}

function handlePassword(socket, input) {
    const characters = loadCharacters();
    if (!input) {
        writeToSocket(socket, "Password cannot be blank. Please enter your password:");
        return;
    }

    const hashedPassword = crypto.createHash('sha256').update(input).digest('hex');

    if (socket.character.new) {
        socket.character.password = hashedPassword;
        socket.character.stage = 'description';
        writeToSocket(socket, "Enter a short description of your character:");
    } else {
        if (characters[socket.character.name].password === hashedPassword) {
            socket.character = characters[socket.character.name];
            socket.character.stage = null;
            writeToSocket(socket, "Login successful! Welcome back.");
            world.moveToRoom(socket, 1);
        } else {
            writeToSocket(socket, "Incorrect password. Please try again:");
        }
    }
}

function handleDescription(socket, input) {
    if (!input) {
        writeToSocket(socket, "Description cannot be blank. Please enter a description:");
        return;
    }

    const characters = loadCharacters();
    socket.character.description = input;
    characters[socket.character.name] = socket.character;
    saveCharacters(characters);

    writeToSocket(socket, "Character creation complete! You are ready to play.");
    socket.character.stage = null;
    world.moveToRoom(socket, 1);
}

function handleCommand(socket, input) {
    const currentRoom = world.getCurrentRoom(socket);
    if (input === 'look') {
        const occupantNames = currentRoom.occupants
            .filter(client => client !== socket)
            .map(client => client.character.name);
        const itemDescriptions = currentRoom.items.map(item => ` - ${item.description}`);
        writeToSocket(socket, `${currentRoom.name}
${currentRoom.description}
Characters here: ${occupantNames.join(', ') || 'None'}
Items in the room:
${itemDescriptions.join('\n') || 'None'}`);
    } else if (input === 'quit') {
        writeToSocket(socket, "Disconnecting...");
        setTimeout(() => {
            socket.end();
        }, 500);
    } else if (input.startsWith('look ')) {
        const targetName = input.slice(5).trim();
        const target = currentRoom.occupants.find(client => client.character.name.toLowerCase() === targetName.toLowerCase());
        if (target) {
            writeToSocket(socket, `You look at ${targetName}: ${target.character.description}`);
            writeToSocket(target, `${socket.character.description} looks at you.`);
        } else {
            const item = currentRoom.items.find(item => item.keywords.some(keyword => keyword.toLowerCase() === targetName.toLowerCase()));
            if (item) {
                writeToSocket(socket, `You look at the ${item.description}.`);
            } else {
                writeToSocket(socket, `You don't see anyone or anything named ${targetName} here.`);
            }
        }
    } else if (input.startsWith('say ')) {
        const message = input.slice(4);
        broadcast(currentRoom, `${socket.character.name} says, "${message}"`, socket);
    } else if (input.startsWith('tell ')) {
        const [recipientName, ...messageParts] = input.slice(5).split(' ');
        const message = messageParts.join(' ');
        const recipientSocket = Array.from(world.getAllSockets()).find(client => client.character.name.toLowerCase() === recipientName.toLowerCase());
        if (recipientSocket) {
            writeToSocket(recipientSocket, `${socket.character.name} tells you, "${message}"`);
            writeToSocket(socket, `You tell ${recipientSocket.character.name}, "${message}"`);
        } else {
            writeToSocket(socket, `No one named ${recipientName} is currently connected.`);
        }
    } else if (input.startsWith('whisper ')) {
        const [recipientName, ...messageParts] = input.slice(8).split(' ');
        const message = messageParts.join(' ');
        const recipientSocket = currentRoom.occupants.find(client => client.character.name.toLowerCase() === recipientName.toLowerCase());
        if (recipientSocket) {
            writeToSocket(recipientSocket, `${socket.character.description} whispers to you, "${message}"`);
            writeToSocket(socket, `You whisper to ${recipientSocket.character.name}, "${message}"`);
        } else {
            writeToSocket(socket, `You don't see anyone named ${recipientName} here.`);
        }
    } else if (['north', 'east', 'south', 'west'].includes(input)) {
        const nextRoomId = currentRoom.exits[input];
        if (nextRoomId) {
            world.moveToRoom(socket, nextRoomId, input);
        } else {
            writeToSocket(socket, "You can't go that way.");
        }
    } else {
        writeToSocket(socket, "Unknown command.");
    }
}

module.exports = { handleCommand, handleLogin, handlePassword, handleDescription };
