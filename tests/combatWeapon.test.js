import assert from 'assert/strict';
import { produceAttack } from '../modules/combat/registry.js';
import '../modules/combat/index.js'; // registers the weapon-aware attack producer
import { loadStatDefinitions } from '../modules/content/loadStatDefinitions.js';
import { initStat } from '../modules/stats.js';
import { Item } from '../modules/Item.js';

loadStatDefinitions(); // real content/stats/attributes.json - gives offense/defense roles

function makeCombatant() {
    const character = { name: 'Fighter', components: {}, equipment: {} };
    initStat(character, 'strength', 10);
    initStat(character, 'dexterity', 10);
    return character;
}

// Unarmed: the flat default damage, when nothing is equipped in the
// weapon slot at all
{
    const attacker = makeCombatant();
    const defender = makeCombatant();
    assert.equal(produceAttack(attacker, defender).damage, 1);
}

// A wielded weapon's `components.weapon.damage` (theme data on the item,
// see ARCHITECTURE.md's Equipment section) overrides the unarmed default
{
    const attacker = makeCombatant();
    const defender = makeCombatant();
    const sword = new Item('a sword', 'A sword.', ['sword'], { equip: { slot: 'weapon' } });
    sword.components.weapon = { damage: 5 };
    attacker.equipment.weapon = sword;

    assert.equal(produceAttack(attacker, defender).damage, 5);
}

// An item equipped in a slot other than "weapon" has no effect on damage
{
    const attacker = makeCombatant();
    const defender = makeCombatant();
    const cap = new Item('a cap', 'A cap.', ['cap'], { equip: { slot: 'head' } });
    cap.components.weapon = { damage: 99 }; // wrong slot - shouldn't matter even if theme data is present
    attacker.equipment.head = cap;

    assert.equal(produceAttack(attacker, defender).damage, 1);
}

console.log('All tests passed');
