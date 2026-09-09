import assert from 'assert/strict';
import { Room } from '../modules/Room.js';
import { Item } from '../modules/Item.js';

// A fresh room starts clean - nothing to save until something changes
{
    const room = new Room('Room A', 'A room.');
    assert.equal(room.dirty, false);
    room.markDirty();
    assert.equal(room.dirty, true);
}

// toSaveData covers inventory/components only - name/description/exits
// always come from content, not a save file
{
    const room = new Room('Storage Room', 'A cluttered storeroom.');
    room.exits.east = 'narrow-hallway';
    room.components.weather = { raining: true };
    const pouch = new Item('a pouch', 'A small pouch.', ['pouch']);
    room.inventory.push(pouch);

    assert.deepStrictEqual(room.toSaveData(), {
        inventory: [pouch.toSaveData()],
        components: { weather: { raining: true } },
    });
}

// restoreFrom replaces the content-seeded inventory/components with the
// saved snapshot, as real Item instances, and doesn't touch `dirty`
{
    const room = new Room('Storage Room', 'A cluttered storeroom.');
    room.inventory.push(new Item('a rusty key', 'An old key.', ['rusty', 'key']));
    room.markDirty();

    room.restoreFrom({
        inventory: [{ name: 'a pouch', description: 'A small pouch.', keywords: ['pouch'] }],
        components: { weather: { raining: true } },
    });

    assert.equal(room.inventory.length, 1, 'saved inventory should replace the content-seeded one');
    assert.ok(room.inventory[0] instanceof Item, 'restored inventory entries should be real Item instances');
    assert.equal(room.inventory[0].name, 'a pouch');
    assert.deepStrictEqual(room.components, { weather: { raining: true } });
    assert.equal(room.dirty, true, 'restoreFrom should not touch the dirty flag itself');
}

// restoreFrom tolerates a minimal record missing components
{
    const room = new Room('Room A', 'A room.');
    room.restoreFrom({ inventory: [] });
    assert.deepStrictEqual(room.components, {});
}

console.log('All tests passed');
