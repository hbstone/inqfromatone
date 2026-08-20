import { Item } from "./Item.js";

export class Character {
    constructor(name = null, description = null) {
        this.name = null;
        this.keywords = [];
        this.description = description;
        this.inventory = [];

        // Connection/session state
        this.isLoggedIn = false;
        this.stage = "name";
        this.roomId = null;
        this.socket = null;

        // Theme-owned data (see ARCHITECTURE.md). Core never reads/writes
        // into this for a specific theme's keys.
        this.components = {};

        if (name) {
            this.setName(name);
        }
    }

    /**
     * Set the character's name, keeping `keywords` (used for target
     * matching by verbs like look/give/tell) derived from it.
     * @param {string} name
     */
    setName(name) {
        this.name = name;
        this.keywords = name.toLowerCase().split(" ");
    }

    /**
     * A plain, serializable snapshot of this character's persistable game
     * state — everything except auth (password) and connection/session
     * state (isLoggedIn, stage, socket), which aren't Character's concern.
     * @returns {object}
     */
    toSaveData() {
        return {
            description: this.description,
            roomId: this.roomId,
            inventory: this.inventory.map(item => item.toSaveData()),
            components: this.components,
        };
    }

    /**
     * Apply a previously-saved snapshot (see toSaveData) onto this
     * instance. Doesn't touch roomId/room placement — that requires
     * looking the room up through World, which the caller does.
     * @param {object} saveData
     */
    restoreFrom(saveData) {
        this.description = saveData.description ?? null;
        this.components = saveData.components ?? {};
        this.inventory = (saveData.inventory ?? []).map(Item.fromSaveData);
    }
}
