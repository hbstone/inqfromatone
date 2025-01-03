import { v4 as uuidv4 } from "uuid"; // For generating unique IDs

export class World {
    constructor() {
        this.rooms = new Map(); // Store rooms by unique ID
    }

    /**
     * Add a new room to the world.
     * @param {string} name - The name of the room.
     * @param {string} description - The description of the room.
     * @param {string} [id] - An optional unique ID. If not provided, one will be generated.
     * @returns {string} - The unique ID of the newly added room.
     */
    addRoom(name, description, id = uuidv4()) {
        const room = { id, name, description, characters: [], inventory: [], exits: {} };
        this.rooms.set(id, room);
        return id;
    }

    /**
     * Retrieve a room by its unique ID.
     * @param {string} id - The unique ID of the room.
     * @returns {object|null} - The room object, or null if not found.
     */
    getRoomById(id) {
        return this.rooms.get(id) || null;
    }

    /**
     * Retrieve the first room matching a given name.
     * @param {string} name - The name of the room to search for.
     * @returns {object|null} - The first matching room, or null if none found.
     */
    getRoomByName(name) {
        for (const room of this.rooms.values()) {
            if (room.name === name) {
                return room;
            }
        }
        return null;
    }

    /**
     * Retrieve all rooms matching a given name.
     * @param {string} name - The name of the rooms to search for.
     * @returns {object[]} - An array of matching rooms.
     */
    getRoomsByName(name) {
        return Array.from(this.rooms.values()).filter(room => room.name === name);
    }

    /**
     * Retrieve all rooms in the world.
     * @returns {object[]} - An array of all room objects.
     */
    getAllRooms() {
        return Array.from(this.rooms.values());
    }
}
