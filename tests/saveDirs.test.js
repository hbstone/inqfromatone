import { test } from 'node:test';
import assert from 'node:assert';
import path from 'path';
import { charactersDir, roomsDir, useSavesForGame } from '../modules/saveDirs.js';

test('saves default to nowhere until a game is chosen', () => {
    assert.throws(() => charactersDir(), /aren't tied to a game yet/);
    assert.throws(() => roomsDir(), /aren't tied to a game yet/);
});

test("each game's saves get their own folder", () => {
    useSavesForGame('western');
    assert.match(charactersDir(), new RegExp(`saves\\${path.sep}western\\${path.sep}characters$`));
    assert.match(roomsDir(), new RegExp(`saves\\${path.sep}western\\${path.sep}rooms$`));
});
