import assert from 'assert/strict';
import { Character } from '../modules/Character.js';
import { Item } from '../modules/Item.js';
import { isEquippable, canEquip } from '../modules/equipment.js';

function makeSword() {
    return new Item('a sword', 'A sword.', ['sword'], { size: 'small', weight: 2, equip: { slot: 'weapon' } });
}

// isEquippable: presence of `equip`, nothing else
{
    assert.equal(isEquippable(makeSword()), true);
    assert.equal(isEquippable(new Item('a rock', 'A rock.', ['rock'])), false);
}

// canEquip: a non-equippable item is always rejected
{
    const character = new Character('Tester');
    const rock = new Item('a rock', 'A rock.', ['rock']);
    const result = canEquip(character, rock);
    assert.equal(result.ok, false);
    assert.match(result.reason, /can't be worn or wielded/);
}

// canEquip: an empty slot accepts the item
{
    const character = new Character('Tester');
    assert.equal(canEquip(character, makeSword()).ok, true);
}

// canEquip: an occupied slot refuses a second item, regardless of which
// item is already there - equip.js never auto-swaps, remove is explicit
{
    const character = new Character('Tester');
    character.equipment.weapon = makeSword();
    const result = canEquip(character, makeSword());
    assert.equal(result.ok, false);
    assert.match(result.reason, /already wearing something/);
}

// canEquip: different slots don't interfere with each other
{
    const character = new Character('Tester');
    character.equipment.weapon = makeSword();
    const cap = new Item('a cap', 'A cap.', ['cap'], { size: 'small', weight: 0.5, equip: { slot: 'head' } });
    assert.equal(canEquip(character, cap).ok, true);
}

console.log('All tests passed');
