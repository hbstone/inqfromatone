export function writeToSocket(socket, message) {
  const formattedMessage = message.charAt(0).toUpperCase() + message.slice(1);
  socket.write(formattedMessage + "\n");
}

export function broadcast(room, message, excludeSocket = null) {
  const clients = room.characters || room.occupants || [];
  clients.forEach((client) => {
    if (client !== excludeSocket) {
      writeToSocket(client, message);
    }
  });
}