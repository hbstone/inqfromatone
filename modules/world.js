const { broadcast } = require('./utils');
const world = {
    rooms: {
        1: {
            name: "The Common Room",
            description: "A cozy medieval tavern with a wooden bar lined with stools, a few sturdy tables scattered about, and shelves stocked with bottles and mugs. A small fireplace in the corner adds a touch of warmth. A storage door to the back hints at the supplies kept out of sight.",
            exits: { east: 2 },
            occupants: [],
            items: [{
                keywords: ["mug", "cup"],
                description: "A simple wooden mug, slightly chipped but functional.",
            }],
        },
        2: {
            name: "The Garden",
            description: "A lush garden with blooming flowers and buzzing bees.",
            exits: { west: 1 },
            occupants: [],
            items: [],
        },
    },
    getCurrentRoom(socket) {
        return this.rooms[socket.character?.currentRoom || 1];
    },
    getAllSockets() {
        return Object.values(this.rooms).reduce((all, room) => all.concat(room.occupants), []);
    },
    moveToRoom(socket, roomId, direction = null) {
        const currentRoom = this.getCurrentRoom(socket);
        currentRoom.occupants = currentRoom.occupants.filter(client => client !== socket);
        const nextRoom = this.rooms[roomId];
        nextRoom.occupants.push(socket);
        socket.character.currentRoom = roomId;
        
        broadcast(currentRoom, `${socket.character.name} leaves${direction ? ` from the ${direction}` : ''}.`, socket);
        writeToSocket(socket, `You are now in ${nextRoom.name}.\n${nextRoom.description}`);
        broadcast(nextRoom, `${socket.character.name} enters${direction ? ` from the ${direction}` : ''}.`, socket);
    }
};

module.exports = { world };
