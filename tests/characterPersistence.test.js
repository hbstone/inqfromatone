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
            components: { lockpick: { uses: 3 } },
        }],
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
}

console.log('All tests passed');
