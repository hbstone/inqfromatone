import assert from 'assert/strict';
import { Item } from '../modules/Item.js';
import { isContainer, getEffectiveWeight, canContain, canContainAll } from '../modules/containers.js';

function makePouch() {
    return new Item('a pouch', 'A small pouch.', ['pouch'], {
        size: 'small', weight: 0.5, container: { maxItemSize: 'small', capacityWeight: 5 },
    });
}

function makeBackpack() {
    return new Item('a backpack', 'A canvas backpack.', ['backpack'], {
        size: 'medium', weight: 2, container: { maxItemSize: 'medium', capacityWeight: 20 },
    });
}

function makeItem(size, weight) {
    return new Item('a thing', 'A thing.', ['thing'], { size, weight });
}

// isContainer: presence of `container`, nothing else
{
    assert.equal(isContainer(makePouch()), true);
    assert.equal(isContainer(makeItem('small', 1)), false);
}

// getEffectiveWeight: a plain item is just its own weight; a container
// adds its contents', recursively
{
    const item = makeItem('small', 3);
    assert.equal(getEffectiveWeight(item), 3);

    const pouch = makePouch(); // weight 0.5
    pouch.inventory.push(makeItem('small', 1), makeItem('small', 2));
    assert.equal(getEffectiveWeight(pouch), 3.5);

    const backpack = makeBackpack(); // weight 2
    backpack.inventory.push(pouch); // pouch's effective weight (3.5) counts, not just its own (0.5)
    assert.equal(getEffectiveWeight(backpack), 5.5);
}

// canContain: a non-container refuses everything
{
    const notAContainer = makeItem('small', 1);
    const result = canContain(notAContainer, makeItem('small', 1));
    assert.equal(result.ok, false);
}

// canContain: size gate - a medium item doesn't fit in a pouch (max small),
// even with plenty of weight budget left
{
    const pouch = makePouch();
    const result = canContain(pouch, makeItem('medium', 1));
    assert.equal(result.ok, false);
    assert.match(result.reason, /too big/);
}

// canContain: weight gate - a small-enough item can still be too heavy
{
    const pouch = makePouch(); // capacityWeight 5
    const result = canContain(pouch, makeItem('small', 6));
    assert.equal(result.ok, false);
    assert.match(result.reason, /weight/);
}

// canContain: exactly at capacity is allowed (<=, not <)
{
    const pouch = makePouch(); // capacityWeight 5
    assert.equal(canContain(pouch, makeItem('small', 5)).ok, true);
}

// canContain: existing contents count against the budget for the next item
{
    const pouch = makePouch(); // capacityWeight 5
    pouch.inventory.push(makeItem('small', 4));
    assert.equal(canContain(pouch, makeItem('small', 1)).ok, true, 'exactly fills the remaining budget');
    assert.equal(canContain(pouch, makeItem('small', 1.5)).ok, false, 'exceeds the remaining budget');
}

// canContain: a container can't be put inside itself
{
    const pouch = makePouch();
    const result = canContain(pouch, pouch);
    assert.equal(result.ok, false);
}

// canContain: catches an indirect cycle - putting a backpack into a pouch
// it (transitively) already contains, size limits don't rule this out by
// themselves once two containers happen to share a size class
{
    const backpack = makeBackpack();
    const otherBackpack = makeBackpack();
    backpack.inventory.push(otherBackpack); // backpack now contains otherBackpack

    const result = canContain(otherBackpack, backpack); // ... so this must be rejected
    assert.equal(result.ok, false);
}

// canContain: a within-limits item fits normally
{
    const backpack = makeBackpack();
    assert.equal(canContain(backpack, makeItem('small', 1)).ok, true);
    assert.equal(canContain(backpack, makePouch()).ok, true, 'a small container fits in a medium one');
}

// canContainAll: weighs the whole batch cumulatively, not each item
// against the container's still-empty current state - three 2-weight
// items individually fit a 5-capacity pouch, but not all three together
{
    const pouch = makePouch(); // capacityWeight 5
    const items = [makeItem('small', 2), makeItem('small', 2), makeItem('small', 2)];

    assert.equal(canContain(pouch, items[0]).ok, true, 'sanity check: one alone fits fine');
    assert.equal(canContainAll(pouch, items).ok, false, 'but all three together (6) exceed capacity (5)');
}

// canContainAll: exactly at the cumulative capacity is allowed
{
    const pouch = makePouch(); // capacityWeight 5
    const items = [makeItem('small', 2), makeItem('small', 3)];
    assert.equal(canContainAll(pouch, items).ok, true);
}

// canContainAll: existing contents still count against the batch's budget
{
    const pouch = makePouch(); // capacityWeight 5
    pouch.inventory.push(makeItem('small', 4));
    assert.equal(canContainAll(pouch, [makeItem('small', 1)]).ok, true, 'fills the remaining budget exactly');
    assert.equal(canContainAll(pouch, [makeItem('small', 0.6), makeItem('small', 0.6)]).ok, false, 'together exceed it');
}

// canContainAll: one bad item (too big) fails the whole batch, even if
// the others in it are individually fine
{
    const pouch = makePouch();
    const items = [makeItem('small', 1), makeItem('medium', 1)];
    const result = canContainAll(pouch, items);
    assert.equal(result.ok, false);
    assert.match(result.reason, /too big/);
}

// canContain is just canContainAll for a single item - same result
// either way
{
    const pouch = makePouch();
    const item = makeItem('small', 1);
    assert.deepStrictEqual(canContain(pouch, item), canContainAll(pouch, [item]));
}

console.log('All tests passed');
