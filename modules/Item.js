export class Item {
    constructor(name, description, keywords) {
        this.name = name;
        this.description = description;
        this.keywords = keywords;

        // Theme-owned data (see ARCHITECTURE.md). Core never reads/writes
        // into this for a specific theme's keys.
        this.components = {};
    }
}
