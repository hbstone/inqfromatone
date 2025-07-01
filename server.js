import net from "net";
import { handleCommand } from "./game.js";
import { writeToSocket } from "./modules/utils.js";

const PORT = 8484; // eventually process.env.PORT || 8484

const server = net.createServer((socket) => {
    socket.character = { isLoggedIn: false }; // Initialize character state
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
    });

    socket.on("error", (err) => {
        console.error("Socket error:", err);
    });
});

server.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
