function writeToSocket(socket, message) {
    const formattedMessage = message.charAt(0).toUpperCase() + message.slice(1);
    socket.write(formattedMessage + '\n');
}

function broadcast(room, message, excludeSocket = null) {
    room.occupants.forEach(client => {
        if (client !== excludeSocket) {
            writeToSocket(client, message);
        }
    });
}

module.exports = { writeToSocket, broadcast };