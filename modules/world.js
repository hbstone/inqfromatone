const { broadcast } = require('./utils');
const world = {
    rooms: {
        1: {
            name: "The Common Room",
            description: "A cozy room with a fireplace crackling in the corner.",
            exits: { east: 2 },
            occupants: [],
        },
        2: {
            name: "The Garden",
            description: "A lush garden with blooming flowers and buzzing bees.",
            exits: { west: 1 },
            occupants: [],
        },
    },
    getCurrentRoom(socket) {
        return this.rooms[socket.character?.currentRoom || 1];
    },
    getAllSockets() {
        return Object.values(this.rooms).reduce((all, room) => all.concat(room.occupants), []);
    },
    moveToRoom(socket, roomId, direction) {
        const currentRoom = this.getCurrentRoom(socket);
        currentRoom.occupants = currentRoom.occupants.filter(client => client !== socket);
        const nextRoom = this.rooms[roomId];
        nextRoom.occupants.push(socket);
        socket.character.currentRoom = roomId;
        broadcast(currentRoom, `${socket.character.name} leaves ${direction}.`, socket);
        broadcast(nextRoom, `${socket.character.name} enters from the ${direction}.`, socket);
        writeToSocket(socket, `You are now in ${nextRoom.name}.
${nextRoom.description}`);
    }
};

module.exports = { world };
