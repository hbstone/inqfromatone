import assert from 'assert/strict';
import { Character } from '../modules/Character.js';
import { Item } from '../modules/Item.js';
import { wear, wield } from '../modules/commands/wear.js';
import { remove } from '../modules/commands/remove.js';

function makeSword() {
    return new Item('a sword', 'A sword.', ['sword'], { size: 'small', weight: 2, equip: { slot: 'weapon' } });
}

function makeCap() {
    return new Item('a cap', 'A cap.', ['cap'], { size: 'small', weight: 0.5, equip: { slot: 'head' } });
}

// wear: moves an equippable item from inventory into its slot
{
    const character = new Character('Tester');
    const sword = makeSword();
    character.inventory.push(sword);

    const result = wear(null, ['sword'], character);
    assert.equal(result, 'You wear a sword.');
    assert.equal(character.equipment.weapon, sword);
    assert.equal(character.inventory.length, 0);
}

// wield is the same mechanism, worded differently - and fuzzy keyword
// matching (a substring of "sword") still applies, same as get/drop
{
    const character = new Character('Tester');
    const sword = makeSword();
    character.inventory.push(sword);

    assert.equal(wield(null, ['swo'], character), 'You wield a sword.');
    assert.equal(character.equipment.weapon, sword);
}

// wear: not carrying it
{
    const character = new Character('Tester');
    assert.equal(wear(null, ['sword'], character), "You aren't carrying that.");
}

// wear: not equippable at all
{
    const character = new Character('Tester');
    const rock = new Item('a rock', 'A rock.', ['rock']);
    character.inventory.push(rock);
    assert.equal(wear(null, ['rock'], character), "a rock can't be worn or wielded.");
    assert.equal(character.inventory.length, 1, 'a failed wear should not move the item');
}

// wear: slot already occupied - fails, doesn't auto-swap, item stays put
{
    const character = new Character('Tester');
    character.equipment.weapon = makeSword();
    const secondSword = makeSword();
    character.inventory.push(secondSword);

    const result = wear(null, ['sword'], character);
    assert.match(result, /already wearing something/);
    assert.equal(character.equipment.weapon.name, 'a sword');
    assert.equal(character.inventory.length, 1, 'the item that failed to equip stays in inventory');
}

// wear: no argument
{
    const character = new Character('Tester');
    assert.equal(wear(null, [], character), 'What do you want to wear?');
}

// remove: moves an equipped item back into inventory
{
    const character = new Character('Tester');
    const sword = makeSword();
    character.equipment.weapon = sword;

    const result = remove(null, ['sword'], character);
    assert.equal(result, 'You remove a sword.');
    assert.deepStrictEqual(character.equipment, {});
    assert.equal(character.inventory[0], sword);
}

// remove: fuzzy keyword matching applies here too
{
    const character = new Character('Tester');
    character.equipment.head = makeCap();
    assert.equal(remove(null, ['ca'], character), 'You remove a cap.');
}

// remove: nothing equipped matches
{
    const character = new Character('Tester');
    character.equipment.weapon = makeSword();
    assert.equal(remove(null, ['cap'], character), "You aren't wearing that.");
}

// remove: no argument
{
    const character = new Character('Tester');
    assert.equal(remove(null, [], character), 'What do you want to remove?');
}

console.log('All tests passed');
