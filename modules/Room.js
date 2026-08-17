export class Room {
    constructor(name, description) {
        this.name = name;
        this.description = description;
        this.characters = [];
        this.inventory = [];
        this.exits = {};

        // Theme-owned data (see ARCHITECTURE.md). Core never reads/writes
        // into this for a specific theme's keys.
        this.components = {};
    }

    addCharacter(character) {
        this.characters.push(character);
        character.roomId = this.id;
    }

    removeCharacter(character) {
        this.characters = this.characters.filter(c => c !== character);
        if (character.roomId === this.id) {
            character.roomId = null;
        }
    }
}
