import assert from 'assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { World } from '../modules/World.js';
import { Character } from '../modules/Character.js';
import { Item } from '../modules/Item.js';
import { saveWorld, saveCharacter } from '../modules/worldPersistence.js';
import { loadCharacterState, saveCharacterState } from '../data.js';
import { loadRoomState } from '../worldData.js';

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'save-world-'));
const charactersDir = path.join(tempDir, 'characters');
const roomsDir = path.join(tempDir, 'rooms');

try {
    // One checkpoint covers both sides of an item transfer: the room it
    // left and the character holding it
    {
        const world = new World();
        const room = world.getRoomById(world.addRoom('Room', 'A room.', 'room'));
        const picker = new Character('Picker', 'Picks things up.');
        room.addCharacter(picker);

        picker.inventory.push(new Item('a gem', 'A gem.', ['gem'])); // as if just picked up
        room.markDirty();

        saveWorld(world, { charactersDir, roomsDir });

        assert.deepStrictEqual(loadRoomState('room', roomsDir).inventory, []);
        assert.deepStrictEqual(loadCharacterState('Picker', charactersDir).inventory.map(i => i.name), ['a gem']);
        assert.equal(room.dirty, false);
    }

    // saveCharacter merges over the existing record, keeping the password
    {
        saveCharacterState('Keeper', { password: 'hash' }, charactersDir);
        const character = new Character('Keeper', 'Keeps a password.');
        assert.equal(saveCharacter(character, charactersDir), true);

        const saved = loadCharacterState('Keeper', charactersDir);
        assert.equal(saved.password, 'hash');
        assert.equal(saved.description, 'Keeps a password.');
    }

    // ...and refuses to overwrite a save file it can't read, rather than
    // replacing it with one that has no password
    {
        const file = path.join(charactersDir, 'broken.json');
        fs.writeFileSync(file, '{"password": "ha'); // truncated mid-write
        const original = fs.readFileSync(file, 'utf8');

        assert.equal(saveCharacter(new Character('Broken'), charactersDir), false);
        assert.equal(fs.readFileSync(file, 'utf8'), original, 'the unreadable file should be left alone');
    }
} finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
}

console.log('All tests passed');
