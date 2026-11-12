import { randomUUID } from "crypto"; // For generating unique IDs
import { Room } from "./Room.js";
import { keywordMatches } from "./keywordMatch.js";

export class World {
    constructor() {
        this.rooms = new Map(); // Store rooms by unique ID
        this.zones = new Map(); // zone key -> { key, name, description, indoors }
    }

    /**
     * Register a zone: a named group of rooms (see ARCHITECTURE.md's
     * "Zones"). Rooms point at it through room.zone.
     * @param {string} key
     * @param {{ name: string, description?: string, indoors?: boolean }} data
     */
    addZone(key, { name, description = "", indoors = false }) {
        this.zones.set(key, { key, name, description, indoors });
    }

    /**
     * @param {string} key
     * @returns {{ key: string, name: string, description: string, indoors: boolean }|null}
     */
    getZone(key) {
        return this.zones.get(key) ?? null;
    }

    /**
     * Find a room from an id that may predate zones. Saves written before
     * zones existed hold a bare room key ("narrow-hallway") where there's
     * now a zone-qualified id ("start/narrow-hallway"). A bare key resolves
     * if exactly one zone has a room with that key; anything else is null.
     * Pre-zone keys were unique world-wide, so a legacy save always
     * resolves unless the room has since been removed or duplicated.
     * Remove once no pre-zone saves remain (see ARCHITECTURE.md's "Zones").
     * @param {string} id
     * @returns {object|null}
     */
    findRoomAllowingLegacyId(id) {
        const room = this.getRoomById(id);
        if (room || typeof id !== "string" || id.includes("/")) {
            return room;
        }
        const matches = this.getAllRooms().filter(r => r.id.endsWith(`/${id}`));
        return matches.length === 1 ? matches[0] : null;
    }

    /**
     * Add a new room to the world.
     * @param {string} name - The name of the room.
     * @param {string} description - The description of the room.
     * @param {string} [id] - An optional unique ID. If not provided, one will be generated.
     * @returns {string} - The unique ID of the newly added room.
     */
    addRoom(name, description, id = randomUUID()) {
        const room = new Room(name, description);
        room.id = id;
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

    /**
     * Find an online character by keyword, across every room - fuzzy
     * (substring) matching against their keywords, see keywordMatch.js.
     * @param {string} name - Keyword to search for.
     * @returns {object|null} The character object if found, otherwise null.
     */
    getOnlineCharacterByName(name) {
        return this.getOnlineCharacters().find((char) => keywordMatches(char.keywords, name)) ?? null;
    }

    /**
     * All currently-connected characters, across every room.
     * @returns {object[]}
     */
    getOnlineCharacters() {
        return Array.from(this.rooms.values()).flatMap(
            (room) => room.characters.filter((char) => char.socket)
        );
    }
}
