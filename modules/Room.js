export class Room {
    constructor(name, description) {
        this.name = name;
        this.description = description;
        this.characters = [];
        this.inventory = [];
        this.exits = {};
    }

    addCharacter(character) {
        this.characters.push(character);
        character.room = this;
    }

    removeCharacter(character) {
        this.characters = this.characters.filter(c => c !== character);
    }
}
