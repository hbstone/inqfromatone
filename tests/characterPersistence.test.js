import assert from 'assert/strict';
import { Character } from '../modules/Character.js';
import { Item } from '../modules/Item.js';

// toSaveData excludes auth/session fields (password isn't Character's
// concern; isLoggedIn/stage/socket are connection state, not saved state)
{
    const character = new Character('Explorer', 'A curious explorer.');
    character.roomId = 'starting-room';
    character.components.caster = { mana: 50 };

    const key = new Item('a rusty key', 'An old rusty key.', ['rusty', 'key']);
    key.components.lockpick = { uses: 3 };
    character.inventory.push(key);

    const saved = character.toSaveData();
    assert.deepStrictEqual(saved, {
        description: 'A curious explorer.',
        roomId: 'starting-room',
        inventory: [{
            name: 'a rusty key',
            description: 'An old rusty key.',
            keywords: ['rusty', 'key'],
            size: 'small',
            weight: 1,
            container: null,
            equip: null,
            inventory: [],
            components: { lockpick: { uses: 3 } },
        }],
        equipment: {},
        components: { caster: { mana: 50 } },
    });
    assert.ok(!('password' in saved), 'toSaveData should never include password');
}

// restoreFrom round-trips onto a fresh instance: description, components,
// and inventory (as real Item instances, not plain data) all come back
{
    const original = new Character('Explorer', 'A curious explorer.');
    original.components.caster = { mana: 50 };
    const key = new Item('a rusty key', 'An old rusty key.', ['rusty', 'key']);
    key.components.lockpick = { uses: 3 };
    original.inventory.push(key);

    const saved = original.toSaveData();

    const restored = new Character('Explorer');
    restored.restoreFrom(saved);

    assert.equal(restored.description, 'A curious explorer.');
    assert.deepStrictEqual(restored.components, { caster: { mana: 50 } });
    assert.equal(restored.inventory.length, 1);
    assert.ok(restored.inventory[0] instanceof Item, 'restored inventory entries should be real Item instances');
    assert.equal(restored.inventory[0].name, 'a rusty key');
    assert.deepStrictEqual(restored.inventory[0].keywords, ['rusty', 'key']);
    assert.deepStrictEqual(restored.inventory[0].components, { lockpick: { uses: 3 } });
}

// restoreFrom tolerates a minimal/older save record missing newer fields
{
    const character = new Character('Explorer');
    character.restoreFrom({ description: 'Just a description.' });
    assert.equal(character.description, 'Just a description.');
    assert.deepStrictEqual(character.components, {});
    assert.deepStrictEqual(character.inventory, []);
    assert.deepStrictEqual(character.equipment, {});
}

// Equipped items round-trip too, as real Item instances keyed by slot -
// not just the character's own top-level inventory
{
    const original = new Character('Explorer');
    const sword = new Item('a wooden sword', 'A blunt practice sword.', ['wooden', 'sword'], {
        size: 'small', weight: 2, equip: { slot: 'weapon' },
    });
    sword.components.weapon = { damage: 3 };
    original.equipment.weapon = sword;

    const restored = new Character('Explorer');
    restored.restoreFrom(original.toSaveData());

    assert.deepStrictEqual(Object.keys(restored.equipment), ['weapon']);
    const restoredSword = restored.equipment.weapon;
    assert.ok(restoredSword instanceof Item, 'a restored equipped item should be a real Item instance');
    assert.equal(restoredSword.name, 'a wooden sword');
    assert.deepStrictEqual(restoredSword.equip, { slot: 'weapon' });
    assert.deepStrictEqual(restoredSword.components, { weapon: { damage: 3 } });
}

// A container's contents round-trip too, recursively - not just the
// character's own top-level inventory
{
    const original = new Character('Explorer');
    const pouch = new Item('a pouch', 'A small pouch.', ['pouch'], {
        size: 'small', weight: 0.5, container: { maxItemSize: 'small', capacityWeight: 5 },
    });
    const coin = new Item('a coin', 'A tarnished coin.', ['coin'], { size: 'small', weight: 0.1 });
    pouch.inventory.push(coin);
    original.inventory.push(pouch);

    const restored = new Character('Explorer');
    restored.restoreFrom(original.toSaveData());

    const restoredPouch = restored.inventory[0];
    assert.ok(restoredPouch instanceof Item);
    assert.deepStrictEqual(restoredPouch.container, { maxItemSize: 'small', capacityWeight: 5 });
    assert.equal(restoredPouch.inventory.length, 1);
    assert.ok(restoredPouch.inventory[0] instanceof Item, 'nested contents should also be real Item instances');
    assert.equal(restoredPouch.inventory[0].name, 'a coin');
    assert.equal(restoredPouch.inventory[0].weight, 0.1);
}

// A pre-container save record (no size/weight/container/inventory at
// all) still restores cleanly, with sensible defaults
{
    const character = new Character('Explorer');
    character.restoreFrom({
        description: 'Old save.',
        inventory: [{ name: 'a rusty key', description: 'An old rusty key.', keywords: ['rusty', 'key'] }],
    });

    const [key] = character.inventory;
    assert.equal(key.size, 'small');
    assert.equal(key.weight, 1);
    assert.equal(key.container, null);
    assert.equal(key.equip, null);
    assert.deepStrictEqual(key.inventory, []);
}

console.log('All tests passed');
