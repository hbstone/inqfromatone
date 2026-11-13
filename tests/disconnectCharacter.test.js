import assert from 'assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { World } from '../modules/World.js';
import { Character } from '../modules/Character.js';
import { Item } from '../modules/Item.js';
import { disconnectCharacter, quit } from '../modules/commands/quit.js';
import { engageCombat, getSession } from '../modules/combat/session.js';
import { loadStatDefinitions } from '../modules/content/loadStatDefinitions.js';
import { initStat } from '../modules/stats.js';
import { loadCharacterState } from '../data.js';
import { loadRoomState } from '../worldData.js';

loadStatDefinitions(); // real content/stats/attributes.json - gives "vitality" -> "hp"

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

    // Disconnecting mid-fight leaves combat, ending it for a lone opponent
    // (who's told), and no combat state lands in the save
    {
        const { world, room } = makeWorld();
        const leaver = new Character('Fighter', 'Fighting.');
        initStat(leaver, 'hp', 10);
        room.addCharacter(leaver);
        const opponent = new Character('Opponent');
        initStat(opponent, 'hp', 10);
        opponent.socket = fakeSocket();
        room.addCharacter(opponent);

        engageCombat(leaver, opponent);
        disconnectCharacter(world, leaver, 'Fighter has disconnected.', saveDirs);

        assert.equal(getSession(leaver), undefined, 'the leaver should be out of combat');
        assert.equal(getSession(opponent), undefined, 'a lone remaining opponent should be out of combat too');
        assert.ok(
            opponent.socket.messages.some((m) => m.includes('no longer fighting')),
            'the opponent should be told the fight is over',
        );
        assert.equal(
            loadCharacterState('Fighter', saveDirs.charactersDir).components.combat,
            undefined,
            'combat session state should not be persisted',
        );
    }

    // `quit` is refused mid-fight - linkdeath can't be prevented, but a
    // deliberate quit isn't a free escape
    {
        const { world, room } = makeWorld();
        const a = new Character('Quitter');
        initStat(a, 'hp', 10);
        room.addCharacter(a);
        const b = new Character('Foe');
        initStat(b, 'hp', 10);
        room.addCharacter(b);

        engageCombat(a, b);
        const socket = fakeSocket();
        const result = quit(world, [], a, socket);

        assert.match(result, /can't quit/);
        assert.ok(room.characters.includes(a), 'a refused quit leaves them in the world');
        disconnectCharacter(world, a, 'cleanup', saveDirs); // ends the session's timers
    }
} finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
}

console.log('All tests passed');
