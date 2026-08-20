// Core container mechanism (see ARCHITECTURE.md's Containers section).
// Knows the generic shape - size gates what fits, weight gates how much -
// and nothing about which items in content are containers, what they're
// called, or how big "small" really is. An item is a container exactly
// when its `container` field ({ maxItemSize, capacityWeight }) is set;
// its contents live in the ordinary `inventory` array every Item has.
const SIZE_ORDER = ["small", "medium", "large"];

function sizeRank(size) {
    const rank = SIZE_ORDER.indexOf(size);
    if (rank === -1) {
        throw new Error(`Unknown item size "${size}".`);
    }
    return rank;
}

/**
 * @param {object} item
 * @returns {boolean} Whether this item can hold other items.
 */
export function isContainer(item) {
    return item.container != null;
}

/**
 * An item's total weight, including - recursively - whatever it
 * contains. A full backpack weighs more than an empty one; this is what
 * a container's own capacity check weighs incoming items against.
 * @param {object} item
 * @returns {number}
 */
export function getEffectiveWeight(item) {
    if (!isContainer(item)) {
        return item.weight;
    }
    return item.weight + item.inventory.reduce((sum, contained) => sum + getEffectiveWeight(contained), 0);
}

// Whether `ancestor` (transitively) already contains `item` - the cycle
// check canContain needs, since the size/weight checks alone don't rule
// out e.g. two same-size pouches each being put inside the other.
function alreadyContains(ancestor, item) {
    if (!isContainer(ancestor)) {
        return false;
    }
    return ancestor.inventory.some(child => child === item || alreadyContains(child, item));
}

/**
 * Whether `container` can accept `item` right now.
 * @param {object} container
 * @param {object} item
 * @returns {{ ok: true } | { ok: false, reason: string }} `reason` is a
 *   player-facing message, ready to return straight from a command.
 */
export function canContain(container, item) {
    if (!isContainer(container)) {
        return { ok: false, reason: `${container.name} can't hold anything.` };
    }
    if (container === item) {
        return { ok: false, reason: "You can't put something inside itself." };
    }
    if (sizeRank(item.size) > sizeRank(container.container.maxItemSize)) {
        return { ok: false, reason: `${item.name} is too big to fit in ${container.name}.` };
    }
    if (alreadyContains(item, container)) {
        return { ok: false, reason: `${item.name} already contains ${container.name}.` };
    }

    const currentWeight = container.inventory.reduce((sum, contained) => sum + getEffectiveWeight(contained), 0);
    if (currentWeight + getEffectiveWeight(item) > container.container.capacityWeight) {
        return { ok: false, reason: `${container.name} doesn't have room for that much more weight.` };
    }

    return { ok: true };
}
