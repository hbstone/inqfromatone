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
}
