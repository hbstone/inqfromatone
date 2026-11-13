import assert from 'assert/strict';
import crypto from 'crypto';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { mock } from 'node:test';
import { World } from '../modules/World.js';
import { Character } from '../modules/Character.js';
import { createLoginHandler } from '../modules/login.js';
import { loadStatDefinitions } from '../modules/content/loadStatDefinitions.js';
import { characterExists, loadCharacterState, saveCharacterState } from '../data.js';

loadStatDefinitions(); // real content/stats/attributes.json
mock.method(console, 'warn', () => {});
mock.method(console, 'error', () => {});

const charactersDir = fs.mkdtempSync(path.join(os.tmpdir(), 'login-'));

const world = new World();
const startingRoomKey = world.addRoom('Start', 'The starting room.', 'start');
const handleLogin = createLoginHandler({ world, startingRoomKey, charactersDir });

function connect() {
    const socket = { messages: [], ended: false };
    socket.write = (msg) => socket.messages.push(msg);
    socket.end = () => {
        socket.ended = true;
    };
    socket.character = new Character();
    socket.character.socket = socket;
    return socket;
}

// Feed lines through the login handler, returning the last response
function send(socket, ...lines) {
    let response;
    for (const line of lines) {
        response = handleLogin(socket, line);
    }
    return response;
}

function leaveWorld(character) {
    world.getRoomById(character.roomId)?.removeCharacter(character);
}

const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');

try {
    // New character: nothing on disk until the description step finishes,
    // then a complete save with a scrypt hash and initialized stats
    {
        const socket = connect();
        send(socket, 'newbie', 'pw');
        assert.equal(characterExists('Newbie', charactersDir), false, 'no save before creation is complete');

        const response = send(socket, 'A fresh face.');
        assert.match(response, /Welcome, Newbie!/);
        const saved = loadCharacterState('Newbie', charactersDir);
        assert.match(saved.password, /^scrypt\$/);
        assert.equal(saved.description, 'A fresh face.');
        assert.ok(saved.components.stats, 'stats should be initialized and saved');
        assert.equal(socket.character.isLoggedIn, true);
        leaveWorld(socket.character);
    }

    // Returning character logs in with the right password
    {
        const socket = connect();
        assert.match(send(socket, 'Newbie', 'pw'), /Welcome back, Newbie!/);
        assert.equal(socket.character.roomId, 'start');
        leaveWorld(socket.character);
    }

    // A save from before zones holds a bare room key; it still finds the
    // room, now under its zone-qualified id
    {
        world.addRoom('Well', 'An old well.', 'yard/well');
        saveCharacterState('Newbie', { ...loadCharacterState('Newbie', charactersDir), roomId: 'well' }, charactersDir);
        const socket = connect();
        assert.match(send(socket, 'Newbie', 'pw'), /Welcome back, Newbie!/);
        assert.equal(socket.character.roomId, 'yard/well');
        leaveWorld(socket.character);
        // later tests expect Newbie back in the starting room
        saveCharacterState(
            'Newbie',
            { ...loadCharacterState('Newbie', charactersDir), roomId: 'start' },
            charactersDir,
        );
    }

    // Three wrong passwords closes the connection
    {
        const socket = connect();
        send(socket, 'Newbie');
        assert.match(send(socket, 'nope'), /Incorrect password/);
        assert.match(send(socket, 'nope'), /Incorrect password/);
        assert.equal(send(socket, 'nope'), undefined);
        assert.equal(socket.ended, true);
        assert.ok(socket.messages.some((m) => m.includes('Too many incorrect passwords')));
        assert.equal(send(socket, 'pw'), undefined, 'input after the lockout is ignored');
        assert.equal(socket.character.isLoggedIn, false);
    }

    // Logging in while already online takes over the live character
    {
        const first = connect();
        send(first, 'Newbie', 'pw');
        const live = first.character;
        const second = connect();
        assert.match(send(second, 'Newbie', 'pw'), /Reconnected as Newbie/);
        assert.equal(second.character, live, 'the live character moves over, not a fresh copy from disk');
        assert.equal(live.socket, second);
        assert.equal(first.ended, true);
        assert.equal(
            world.getRoomById('start').characters.filter((c) => c.name === 'Newbie').length,
            1,
            'still only one Newbie in the world',
        );
        leaveWorld(second.character);
    }

    // A legacy SHA-256 password works once, and is upgraded on disk
    {
        saveCharacterState(
            'Oldtimer',
            { password: sha256('old'), description: 'From before.', components: {} },
            charactersDir,
        );
        const socket = connect();
        assert.match(send(socket, 'Oldtimer', 'old'), /Welcome back/);
        assert.match(loadCharacterState('Oldtimer', charactersDir).password, /^scrypt\$/);
        leaveWorld(socket.character);

        const again = connect();
        assert.match(send(again, 'Oldtimer', 'old'), /Welcome back/, 'the upgraded hash still verifies');
        leaveWorld(again.character);
    }

    // A half-created save from the old flow (password only) resumes
    // creation instead of logging in a character with no stats
    {
        saveCharacterState('Halfway', { password: sha256('pw') }, charactersDir);
        const socket = connect();
        assert.match(send(socket, 'Halfway', 'pw'), /never finished/);
        assert.match(send(socket, 'Finally done.'), /Welcome, Halfway!/);

        const saved = loadCharacterState('Halfway', charactersDir);
        assert.equal(saved.description, 'Finally done.');
        assert.ok(saved.components.stats);
        assert.match(saved.password, /^scrypt\$/, 'the password survives (rehashed)');
        leaveWorld(socket.character);
    }

    // Two connections creating the same new name: first to finish wins
    {
        const a = connect();
        const b = connect();
        send(a, 'Twin', 'pw-a');
        send(b, 'Twin', 'pw-b');
        assert.match(send(a, 'First.'), /Welcome, Twin!/);
        assert.match(send(b, 'Second.'), /choose another name/);
        assert.equal(b.character.isLoggedIn, false);
        assert.equal(b.character.stage, 'name');

        const check = connect();
        assert.match(send(check, 'Twin', 'pw-a'), /Reconnected as Twin/, "the winner's password is the one saved");
        leaveWorld(check.character);
    }

    // An unreadable save file says so instead of "Incorrect password"
    {
        fs.writeFileSync(path.join(charactersDir, 'corrupt.json'), '{"pass');
        const socket = connect();
        assert.match(send(socket, 'Corrupt', 'pw'), /couldn't be loaded/);
        assert.equal(socket.inputHidden, false, 'echo is back on for the name prompt');
    }

    // Typed input is hidden only while a password is being asked for
    {
        const WILL_ECHO = Buffer.from([0xff, 0xfb, 0x01]);
        const WONT_ECHO = Buffer.from([0xff, 0xfc, 0x01]);
        const echoRequests = (socket) => socket.messages.filter(Buffer.isBuffer);

        const socket = connect();
        send(socket, 'Newbie');
        assert.deepEqual(echoRequests(socket), [WILL_ECHO], 'hidden for the password prompt');
        send(socket, 'wrong');
        assert.deepEqual(echoRequests(socket), [WILL_ECHO], 'still hidden for the retry, not re-sent');
        send(socket, 'pw');
        assert.deepEqual(echoRequests(socket), [WILL_ECHO, WONT_ECHO], 'shown again once logged in');
        leaveWorld(socket.character);

        const fresh = connect();
        send(fresh, 'Brandnew', 'pw');
        assert.deepEqual(echoRequests(fresh), [WILL_ECHO, WONT_ECHO], 'shown again for the description step');
    }
} finally {
    fs.rmSync(charactersDir, { recursive: true, force: true });
}

console.log('All tests passed');
