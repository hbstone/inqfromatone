import assert from 'assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { World } from '../modules/World.js';
import { Character } from '../modules/Character.js';
import { Item } from '../modules/Item.js';
import { disconnectCharacter, quit, registerQuitBlocker } from '../modules/commands/quit.js';
import { on } from '../modules/events.js';
import { loadStatDefinitions } from '../modules/content/loadStatDefinitions.js';
import { loadCharacterState } from '../data.js';
import { loadRoomState } from '../worldData.js';

loadStatDefinitions(); // the default game's stats

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'disconnect-'));
const saveDirs = {
    charactersDir: path.join(tempDir, 'characters'),
    roomsDir: path.join(tempDir, 'rooms'),
};

function fakeSocket() {
    const messages = [];
    return { messages, write: (msg) => messages.push(msg) };
}

function makeWorld() {
    const world = new World();
    const room = world.getRoomById(world.addRoom('Room', 'A room.', 'room'));
    return { world, room };
}

try {
    // Removed from the room, saved, and the room told
    {
        const { world, room } = makeWorld();
        const leaver = new Character('Leaver', 'Leaving.');
        room.addCharacter(leaver);
        const bystander = new Character('Bystander');
        bystander.socket = fakeSocket();
        room.addCharacter(bystander);

        disconnectCharacter(world, leaver, 'Leaver has disconnected.', saveDirs);

        assert.ok(!room.characters.includes(leaver), 'the leaver should be removed from the room');
        assert.equal(leaver.roomId, null);
        assert.equal(
            loadCharacterState('Leaver', saveDirs.charactersDir).roomId,
            'room',
            'the save should reflect where they were, not null',
        );
        assert.ok(
            bystander.socket.messages.some((m) => m.includes('Leaver has disconnected.')),
            'other characters in the room should be notified',
        );

        // Calling it again (e.g. quit's own socket.end() re-firing the close
        // event) must be a safe no-op, not throw.
        assert.doesNotThrow(
            () => disconnectCharacter(world, leaver, 'Leaver has disconnected.', saveDirs),
            'disconnecting an already-disconnected character must not throw',
        );
    }

    // Leaving checkpoints the room side of a transfer too, plus everyone
    // else in the world - a drop right before quitting must not leave the
    // item in the character's save *and* missing from the room's
    {
        const { world, room } = makeWorld();
        const dropper = new Character('Dropper', 'Drops things.');
        room.addCharacter(dropper);
        const other = new Character('Other', 'Still here.');
        room.addCharacter(other);

        room.inventory.push(new Item('a sword', 'A sword.', ['sword'])); // as if just dropped
        room.markDirty();

        disconnectCharacter(world, dropper, 'Dropper has left.', saveDirs);

        assert.deepStrictEqual(
            loadRoomState('room', saveDirs.roomsDir).inventory.map((i) => i.name),
            ['a sword'],
        );
        assert.deepStrictEqual(loadCharacterState('Dropper', saveDirs.charactersDir).inventory, []);
        assert.ok(
            loadCharacterState('Other', saveDirs.charactersDir),
            'other in-world characters are checkpointed too',
        );
    }

    // Packs hear about anyone leaving the world before the save (combat ends
    // their fight there), and can refuse a deliberate quit with a reason
    // (combat does mid-fight); see packs/combat/tests/pack.test.js for combat
    {
        const { world, room } = makeWorld();
        const leaver = new Character('Leaver', 'Leaving.');
        room.addCharacter(leaver);
        const heard = [];
        on('characterLeaving', ({ character, room: from }) => {
            heard.push(`${character.name} from ${from.id} (still there: ${from.characters.includes(character)})`);
            character.components.busy = undefined; // a pack tidying its state before the save
        });
        leaver.components.busy = true;
        disconnectCharacter(world, leaver, 'Leaver has disconnected.', saveDirs);
        assert.deepEqual(heard, [`Leaver from ${room.id} (still there: true)`]);
        assert.equal(
            loadCharacterState('Leaver', saveDirs.charactersDir).components.busy,
            undefined,
            'cleaned up before saving',
        );

        let busy = true;
        registerQuitBlocker((character) => (busy && character.name === 'Stayer' ? "You're busy!" : null));
        const stayer = new Character('Stayer');
        room.addCharacter(stayer);
        assert.equal(quit(world, [], stayer, fakeSocket()), "You're busy!");
        assert.ok(room.characters.includes(stayer), 'a refused quit leaves them in the world');
        busy = false;
        quit(world, [], stayer, { ...fakeSocket(), end() {} });
        assert.ok(!room.characters.includes(stayer), 'allowed once nothing blocks it');
    }
} finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
}

console.log('All tests passed');
