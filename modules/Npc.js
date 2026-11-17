// A non-player character (see ARCHITECTURE.md's "NPCs"). An NPC is a
// Character, so everything that works on someone in a room - look, emote
// @targets, whisper, movement and its messages - works on NPCs unchanged.
// What differs is flagged by `isNpc`: they have no socket, aren't saved
// (they respawn from content each boot), and act through behaviors (see
// modules/npcs/behaviors.js) rather than typed commands.
import { Character } from './Character.js';
import { ARTICLES } from './text.js';

export class Npc extends Character {
    /**
     * @param {object} template - One entry from a zone's npcs.json.
     * @param {string} template.id - "<zone>/<key>".
     * @param {string} template.name - How others see them, written as it
     *   reads mid-sentence ("an old groundskeeper", or a proper name).
     * @param {string[]} [template.keywords] - Defaults to the words of the
     *   name, minus articles.
     * @param {string} [template.description] - Shown when looked at.
     * @param {string} [template.persona] - Who they are, in the author's
     *   words, for a higher brain tier (see modules/npcs/brainContext.js).
     *   Never shown to players.
     * @param {object} [template.behaviors] - behavior name -> its settings.
     * @param {string} [template.presence] - What they're shown doing
     *   (see modules/presence.js), unless a routine post says otherwise.
     * @param {object[]} [template.topics] - What they'll talk about when
     *   asked, and {object} [template.unknownTopic] - their answer to
     *   anything else (see modules/npcs/dialogue.js).
     * @param {boolean} [template.sightings] - Whether they notice who comes
     *   and goes, and {boolean} [template.hearsay] - whether they remember
     *   what's said to them (see modules/npcs/knowledge.js).
     * @param {object} [template.toldReply] - How they react to being told
     *   something (see modules/npcs/dialogue.js).
     * @param {object} [template.senses] - Senses switched off, like
     *   { "sight": false } (see modules/senses.js).
     * @param {object} [template.discretion] - Who they'll pass on what
     *   they know to (see modules/npcs/dialogue.js).
     * @param {object} [template.components] - Data for packs, keyed by
     *   pack (the stealth pack's { "stealth": { "sneakChance": 0.3 } }).
     * @param {object[]} [template.routine] - Daily posts (see
     *   modules/npcs/routine.js), with each `at` already resolved to a
     *   room id as `roomId` by the loader.
     * @param {string} homeRoomId - Where this NPC spawned.
     */
    constructor(
        {
            id,
            name,
            keywords,
            description = '',
            persona = null,
            behaviors = {},
            routine = null,
            presence = null,
            topics,
            unknownTopic,
            sightings,
            hearsay,
            toldReply,
            senses,
            components,
            discretion,
        },
        homeRoomId,
    ) {
        super(name, description);
        if (keywords?.length) {
            this.keywords = keywords.map((k) => k.toLowerCase());
        } else {
            this.keywords = this.keywords.filter((k) => !ARTICLES.has(k));
        }
        this.isNpc = true;
        this.persona = persona;
        this.templateId = id;
        this.behaviors = behaviors;
        this.topics = topics ?? [];
        this.unknownTopic = unknownTopic ?? null;
        this.sightings = sightings === true;
        this.hearsay = hearsay === true;
        this.toldReply = toldReply ?? null;
        this.senses = senses ?? {};
        this.discretion = discretion ?? null;
        this.components = structuredClone(components ?? {});
        this.knowledge = { sightings: {}, heard: [], acquaintances: {} }; // loaded from saves at startup, see modules/npcs/knowledge.js
        this.knowledgeDirty = false;
        this.basePresence = presence;
        this.routine = routine?.length ? routine : null;
        this.unreachablePost = null; // see modules/npcs/behaviors.js's followRoutine
        this.homeRoomId = homeRoomId;
    }
}
