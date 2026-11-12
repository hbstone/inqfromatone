// A non-player character (see ARCHITECTURE.md's "NPCs"). An NPC is a
// Character, so everything that works on someone in a room - look, emote
// @targets, whisper, movement and its messages - works on NPCs unchanged.
// What differs is flagged by `isNpc`: they have no socket, aren't saved
// (they respawn from content each boot), and act through behaviors (see
// modules/npcs/behaviors.js) rather than typed commands.
import { Character } from "./Character.js";

export class Npc extends Character {
    /**
     * @param {object} template - One entry from a zone's npcs.json.
     * @param {string} template.id - "<zone>/<key>".
     * @param {string} template.name - How others see them, written as it
     *   reads mid-sentence ("an old groundskeeper", or a proper name).
     * @param {string[]} [template.keywords] - Defaults to the words of the
     *   name, minus articles.
     * @param {string} [template.description] - Shown when looked at.
     * @param {object} [template.behaviors] - behavior name -> its settings.
     * @param {string} homeRoomId - Where this NPC spawned.
     */
    constructor({ id, name, keywords, description = "", behaviors = {} }, homeRoomId) {
        super(name, description);
        if (keywords?.length) {
            this.keywords = keywords.map(k => k.toLowerCase());
        } else {
            this.keywords = this.keywords.filter(k => !ARTICLES.has(k));
        }
        this.isNpc = true;
        this.templateId = id;
        this.behaviors = behaviors;
        this.homeRoomId = homeRoomId;
    }
}

const ARTICLES = new Set(["a", "an", "the"]);
