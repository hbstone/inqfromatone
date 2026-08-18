import assert from 'assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { characterExists, loadCharacterState, saveCharacterState } from '../data.js';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'data-store-'));

try {
    // No file yet
    assert.equal(characterExists('Bob', dir), false);
    assert.equal(loadCharacterState('Bob', dir), null);

    // Save, then round-trip load
    saveCharacterState('Bob', { password: 'hash123', description: 'A tester.' }, dir);
    assert.equal(characterExists('Bob', dir), true);
    assert.deepStrictEqual(loadCharacterState('Bob', dir), { password: 'hash123', description: 'A tester.' });

    // Overwriting a save replaces the previous content, not merges it
    saveCharacterState('Bob', { password: 'hash123', roomId: 'starting-room' }, dir);
    assert.deepStrictEqual(loadCharacterState('Bob', dir), { password: 'hash123', roomId: 'starting-room' });

    // Case-insensitive: "Bob" and "bob" resolve to the same saved record,
    // avoiding the file-collision bug per-entity storage would otherwise
    // introduce on case-insensitive filesystems
    assert.equal(characterExists('bob', dir), true);
    assert.deepStrictEqual(loadCharacterState('bob', dir), loadCharacterState('Bob', dir));

    // A different name is a distinct record
    assert.equal(characterExists('Alice', dir), false);
    saveCharacterState('Alice', { password: 'hash456' }, dir);
    assert.deepStrictEqual(loadCharacterState('Bob', dir), { password: 'hash123', roomId: 'starting-room' });
    assert.deepStrictEqual(loadCharacterState('Alice', dir), { password: 'hash456' });
} finally {
    fs.rmSync(dir, { recursive: true, force: true });
}

console.log('All tests passed');
