import { Item } from "./Item.js";

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

        // Set by command handlers whenever they mutate this room's
        // inventory (or a container's contents while it sits in this
        // room) - see modules/worldPersistence.js. Starts false: a
        // freshly content-seeded room has nothing to save until something
        // actually changes.
        this.dirty = false;
    }

    /**
     * Mark this room as having unsaved changes. Called by command handlers
     * right after a mutation that should survive a restart (see e.g.
     * modules/commands/drop.js), not by anything in this class itself -
     * Room doesn't know which of its own mutations are worth persisting.
     */
    markDirty() {
        this.dirty = true;
    }

    /**
     * A plain, serializable snapshot of this room's persistable state -
     * everything except name/description/exits, which always come from
     * content (see modules/content/loadWorldData.js), not a save file.
     * Mirrors Character/Item's own toSaveData.
     * @returns {object}
     */
    toSaveData() {
        return {
            inventory: this.inventory.map(item => item.toSaveData()),
            components: this.components,
        };
    }

    /**
     * Apply a previously-saved snapshot (see toSaveData) onto this
     * instance, replacing the content-seeded defaults. Doesn't touch
     * `dirty` - a room that was just loaded from disk matches what's on
     * disk, so it isn't dirty.
     * @param {object} saveData
     */
    restoreFrom(saveData) {
        this.inventory = (saveData.inventory ?? []).map(Item.fromSaveData);
        this.components = saveData.components ?? {};
    }

    /**
     * Exit directions available from this room, for display (e.g. "Exits:
     * north, south" in look/movePlayer) - just the keys of `exits`, in
     * declaration order.
     * @returns {string[]}
     */
    exitNames() {
        return Object.keys(this.exits);
    }

    /**
     * This room's name, wrapped in a color token (see modules/color.js) so
     * it stands out from the description text under it - one place to
     * retune the color, shared by look and movePlayer rather than each
     * picking their own.
     * @returns {string}
     */
    coloredName() {
        return `{C${this.name}{x`;
    }

    /**
     * The "Exits: ..." display line, colored the same way as look's other
     * field labels (Characters here:/Items here:) - see modules/color.js.
     * @returns {string}
     */
    describeExits() {
        const exits = this.exitNames().join(", ") || "None";
        return `{YExits:{x ${exits}`;
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
