export class Character {
    constructor(name, description) {
        this.name = name;
        this.keywords = name.toLowerCase().split(" ");
        this.description = description;
        this.inventory = [];
        this.room = null;
    }
}
