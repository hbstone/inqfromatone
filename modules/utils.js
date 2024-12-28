export function writeToSocket(socket, message) {
    const formattedMessage = message.charAt(0).toUpperCase() + message.slice(1);
    socket.write(formattedMessage + "\n");
}

export function broadcast(room, message, excludeSocket = null) {
    room.characters.forEach((character) => {
        const clientSocket = character.socket;
        if (clientSocket && clientSocket !== excludeSocket) {
            writeToSocket(clientSocket, message);
        }
    });
}
