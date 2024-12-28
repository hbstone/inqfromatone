import {
  handleCommand,
  handleLogin,
  handlePassword,
  handleDescription,
} from "./game";
import { world, broadcast } from "./world";
import { writeToSocket } from "./utils";

function handleSocket(socket) {
  writeToSocket(socket, "Welcome to the MUD server!");

  socket.character = { stage: "login" }; // Character creation state

  socket.on("data", (data) => {
    const input = data.toString().trim();

    if (socket.character.stage === "login") {
      handleLogin(socket, input);
    } else if (socket.character.stage === "password") {
      handlePassword(socket, input);
    } else if (socket.character.stage === "description") {
      handleDescription(socket, input);
    } else {
      handleCommand(socket, input);
    }
  });

  socket.on("end", () => {
    const currentRoom = socket.character?.currentRoom
      ? world.rooms[socket.character.currentRoom]
      : null;
    if (currentRoom) {
      currentRoom.occupants = currentRoom.occupants.filter(
        (client) => client !== socket,
      );
      broadcast(currentRoom, `${socket.character.name} has left the game.`);
    }
    console.log("User disconnected");
  });
}

export default { handleSocket };
