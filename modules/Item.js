export class Item {
    /**
     * @param {string} name
     * @param {string} description
     * @param {string[]} keywords
     * @param {object} [options]
     * @param {"small"|"medium"|"large"} [options.size] - Defaults to "small".
     * @param {number} [options.weight] - Defaults to 1. Per-unit when
     *   `stackable` - see modules/stacking.js and modules/containers.js.
     * @param {{maxItemSize: string, capacityWeight: number}|null} [options.container] -
     *   Presence marks this item as a container - see modules/containers.js.
     * @param {{slot: string}|null} [options.equip] - Presence marks this
     *   item as equippable into the named slot - see modules/equipment.js.
     * @param {boolean} [options.stackable] - Whether identical instances of
     *   this item (same `name`) merge into one object carrying a `quantity`
     *   instead of one object per unit - see modules/stacking.js. Defaults
     *   to false; unset for existing content (bricks, pouches, etc.), which
     *   deliberately keeps its "N separate objects" proof-of-concept shape.
     * @param {number} [options.quantity] - How many units this object
     *   represents. Only meaningful when `stackable` is set; defaults to 1.
     */
    constructor(name, description, keywords, { size = "small", weight = 1, container = null, equip = null, stackable = false, quantity = 1 } = {}) {
        this.name = name;
        this.description = description;
        this.keywords = keywords;
        this.size = size;
        this.weight = weight;
        this.container = container; // { maxItemSize, capacityWeight } | null
        this.inventory = []; // only ever populated when `container` is set
        this.equip = equip; // { slot } | null
        this.stackable = stackable;
        this.quantity = quantity;

        // Theme-owned data (see ARCHITECTURE.md). Core never reads/writes
        // into this for a specific theme's keys.
        this.components = {};
    }

    /**
     * A plain, serializable snapshot of this item - recurses into
     * `inventory` so a container's contents round-trip too. Mirrors
     * Character's toSaveData/restoreFrom split, one level down.
     * @returns {object}
     */
    toSaveData() {
        return {
            name: this.name,
            description: this.description,
            keywords: this.keywords,
            size: this.size,
            weight: this.weight,
            container: this.container,
            equip: this.equip,
            stackable: this.stackable,
            quantity: this.quantity,
            inventory: this.inventory.map(item => item.toSaveData()),
            components: this.components,
        };
    }

    /**
     * Rebuild an Item - and, recursively, whatever it contains - from a
     * previously-saved snapshot (see toSaveData). Tolerates an
     * older/minimal record missing the newer fields (size/weight/
     * container/inventory didn't always exist).
     * @param {object} data
     * @returns {Item}
     */
    static fromSaveData(data) {
        const item = new Item(data.name, data.description, data.keywords ?? [], {
            size: data.size,
            weight: data.weight,
            container: data.container ?? null,
            equip: data.equip ?? null,
            stackable: data.stackable ?? false,
            quantity: data.quantity ?? 1,
        });
        item.components = data.components ?? {};
        item.inventory = (data.inventory ?? []).map(Item.fromSaveData);
        return item;
    }
}
