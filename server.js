import net from "net";
import { handleCommand, handleDisconnect } from "./game.js";
import { writeToSocket } from "./modules/utils.js";
import { Character } from "./modules/Character.js";

// Allow PORT to be overridden via environment variable for deployment flexibility
const PORT = process.env.PORT || 8484;

const server = net.createServer((socket) => {
    socket.character = new Character(); // Initialize character state
    socket.character.socket = socket;
    writeToSocket(socket, "Welcome to the game! Please enter your character's name:");

    socket.on("data", (data) => {
        const input = data.toString().trim();
        const response = handleCommand(socket, input);
        if (response) {
            writeToSocket(socket, response);
        }
    });

    socket.on("end", () => {
        if (socket.character.name) {
            console.log(`${socket.character.name} has disconnected.`);
        }
        handleDisconnect(socket);
    });

    socket.on("error", (err) => {
        console.error("Socket error:", err);
    });
});

server.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
