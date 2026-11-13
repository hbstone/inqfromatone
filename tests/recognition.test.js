import assert from 'assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { mock } from 'node:test';
import { World } from '../modules/World.js';
import { Character } from '../modules/Character.js';
import { Npc } from '../modules/Npc.js';
import { enableRecognition, disableRecognition, validateShortDesc } from '../modules/recognition/index.js';
import { remember, forget, rename, shortdesc } from '../modules/recognition/commands.js';
import { nameFor, findCharacter } from '../modules/naming.js';
import { look } from '../modules/commands/look.js';
import { say } from '../modules/commands/say.js';
import { createLoginHandler } from '../modules/login.js';
import { loadStatDefinitions } from '../modules/content/loadStatDefinitions.js';
import { loadFeatures } from '../modules/content/loadFeatures.js';
import { saveCharacterState, loadCharacterState } from '../data.js';
import { stripColors } from '../modules/color.js';

loadStatDefinitions();
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'recognition-'));
const charactersDir = path.join(tmp, 'characters');
enableRecognition({ charactersDir });

function setup() {
    const world = new World();
    const room = world.getRoomById(world.addRoom('Hall', 'A hall.', 'hall'));
    const make = (name, shortDesc) => {
        const character = new Character(name, `${name}'s long description.`);
        character.shortDesc = shortDesc;
        character.socket = { messages: [], write(m) { this.messages.push(stripColors(m).trim()); } };
        room.addCharacter(character);
        return character;
    };
    const alice = make('Alice', 'a tall woman');
    const rhaehan = make('Rhaehan', 'a bearded man');
    return { world, room, alice, rhaehan, make };
}
const last = (character) => character.socket.messages.at(-1);

try {
    // Short descriptions: tidied and checked
    {
        assert.deepEqual(validateShortDesc('  A   bearded man ', 'Rhaehan'), { value: 'a bearded man' });
        assert.deepEqual(validateShortDesc('The {Rred{x cloak', 'Bob'), { value: 'the red cloak' });
        assert.deepEqual(validateShortDesc('tall, dark-haired stranger', 'Bob'), { value: "tall, dark-haired stranger" });
        assert.match(validateShortDesc('ab', 'Bob').error, /3-50 characters/);
        assert.match(validateShortDesc('a man with 3 eyes', 'Bob').error, /only use letters/);
        assert.match(validateShortDesc('Rhaehan the bearded', 'Rhaehan').error, /can't include your name/);
    }

    // Strangers see short descriptions and can only target by them; you see
    // your own name; NPCs are unchanged
    {
        const { world, room, alice, rhaehan } = setup();
        assert.equal(nameFor(rhaehan, alice), 'a bearded man');
        assert.equal(nameFor(alice, alice), 'Alice');
        assert.equal(findCharacter(alice, room.characters, 'rhaehan'), null, 'real names do not match strangers');
        assert.equal(findCharacter(alice, room.characters, 'beard'), rhaehan);

        const cat = new Npc({ id: 'z/cat', name: 'a grey cat' }, 'hall');
        room.addCharacter(cat);
        assert.equal(nameFor(cat, alice), 'a grey cat');
        assert.match(stripColors(look(world, [], alice)), /Characters here: a bearded man, a grey cat/);

        say(world, ['hi'], alice);
        assert.equal(last(rhaehan), 'A tall woman says, "Hi."');
    }

    // remember <keyword> <name>: from then on, you (only you) see and can
    // target them by that name, multi-word names by any word
    {
        const { world, room, alice, rhaehan, make } = setup();
        const carol = make('Carol', 'a stout dwarf');
        assert.equal(remember(world, ['bearded', 'Insolent', 'Jerk'], alice), "You'll remember a bearded man as Insolent Jerk.");
        assert.equal(nameFor(rhaehan, alice), 'Insolent Jerk');
        assert.equal(nameFor(rhaehan, carol), 'a bearded man', "Carol hasn't met him");
        assert.equal(findCharacter(alice, room.characters, 'insolent'), rhaehan);
        assert.equal(findCharacter(alice, room.characters, 'jer'), rhaehan, 'fuzzy, like other keywords');
        assert.equal(findCharacter(alice, room.characters, 'rhaehan'), null);

        say(world, ['hello'], rhaehan);
        assert.equal(last(alice), 'Insolent Jerk says, "Hello."');
        assert.equal(last(carol), 'A bearded man says, "Hello."');
    }

    // Notes: once remembered, extra text is a note, findable by either name
    // word, or by what you see of them in the room
    {
        const { world, alice } = setup();
        remember(world, ['bearded', 'Insolent', 'Jerk'], alice);
        assert.equal(remember(world, ['jerk', 'did', 'some', 'kinda', 'thing'], alice), 'You add a note about Insolent Jerk.');
        assert.equal(remember(world, ['bearded', 'apologized,', 'sort', 'of'], alice), 'You add a note about Insolent Jerk.');
        const detail = remember(world, ['insolent'], alice);
        assert.match(detail, /^Insolent Jerk\n {2}Looks like: a bearded man\n {2}Notes:\n {4}1\. \[\d{4}-\d\d-\d\d\] did some kinda thing\n {4}2\. \[\d{4}-\d\d-\d\d\] apologized, sort of$/);
        assert.equal(alice.memories.rhaehan.notes.length, 2);
    }

    // The conflict guard: a stranger whose look matches one of your
    // remembered names doesn't get your note as their name
    {
        const { world, alice, make } = setup();
        remember(world, ['bearded', 'Insolent', 'Jerk'], alice);
        const stranger = make('Mallory', 'a jerky-looking man');
        assert.equal(remember(world, ['jerk', 'was', 'rude', 'again', 'today', 'and', 'I', 'did', 'not', 'like', 'it'], alice),
            'You add a note about Insolent Jerk.');
        assert.equal(nameFor(stranger, alice), 'a jerky-looking man');

        // ...and a stranger can't be given a sentence for a name
        const reply = remember(world, ['wiry', 'thinks', 'he', 'owns', 'the', 'place', 'honestly'], (() => { make('Dan', 'a wiry lad'); return alice; })());
        assert.match(reply, /too long for a name.*don't remember anyone matching "wiry" yet/);
    }

    // Can't remember yourself or NPCs; unknown keywords explain themselves
    {
        const { world, room, alice } = setup();
        room.addCharacter(new Npc({ id: 'z/cat', name: 'a grey cat' }, 'hall'));
        assert.match(remember(world, ['cat', 'Smudge'], alice), /NPCs can't be remembered yet/);
        assert.match(remember(world, ['tall', 'Me'], alice), /don't see anyone like that here/);
        assert.match(remember(world, ['ghost', 'Boo'], alice), /don't remember anyone matching "ghost"/);
        assert.match(remember(world, ['bearded'], alice), /Remember a bearded man as what\?/);
    }

    // Two memories matching equally: ask, don't guess; an exact word wins
    {
        const { world, alice, make } = setup();
        remember(world, ['bearded', 'Big', 'Tom'], alice);
        make('Tomas', 'a lanky youth');
        remember(world, ['lanky', 'Little', 'Tom'], alice);
        assert.match(remember(world, ['tom', 'note'], alice), /could be Big Tom or Little Tom/);
        assert.equal(remember(world, ['big', 'note'], alice), 'You add a note about Big Tom.');
    }

    // forget: two steps when there are notes
    {
        const { world, alice, rhaehan } = setup();
        remember(world, ['bearded', 'Insolent', 'Jerk'], alice);
        remember(world, ['jerk', 'a', 'note'], alice);
        assert.match(forget(world, ['jerk'], alice), /still have a note about Insolent Jerk.*forget jerk memories/);
        assert.equal(nameFor(rhaehan, alice), 'Insolent Jerk', 'nothing forgotten yet');
        assert.equal(forget(world, ['jerk', 'memories'], alice), 'You clear your note about Insolent Jerk.');
        assert.equal(forget(world, ['jerk'], alice), "You forget Insolent Jerk. They'll be a stranger to you again.");
        assert.equal(nameFor(rhaehan, alice), 'a bearded man');
        assert.match(forget(world, ['jerk'], alice), /don't remember anyone/);
        assert.match(forget(world, ['jerk', 'everything'], alice), /Usage/);
    }

    // A changed look keeps recognition, and remember shows the change;
    // rename changes the name and catches up the look
    {
        const { world, alice, rhaehan } = setup();
        rhaehan.shortDesc = 'a wiry lad';
        remember(world, ['wiry', 'Rhaehan'], alice);
        assert.equal(shortdesc(world, ['a', 'stout', 'bearded', 'man'], rhaehan), 'Strangers now see you as "a stout bearded man".');
        assert.equal(nameFor(rhaehan, alice), 'Rhaehan', 'still recognized');
        assert.match(remember(world, ['rhaehan'], alice), /Looks like: a stout bearded man\n {2}When you named them: a wiry lad/);

        assert.equal(rename(world, ['rhaehan', 'Old', 'Friend'], alice), "You'll now think of Rhaehan as Old Friend.");
        assert.equal(nameFor(rhaehan, alice), 'Old Friend');
        assert.doesNotMatch(remember(world, ['friend'], alice), /When you named them/);
    }

    // Offline: remember reads their current look from their save
    {
        const { world, room, alice, rhaehan } = setup();
        remember(world, ['bearded', 'Jerk'], alice);
        room.removeCharacter(rhaehan);
        saveCharacterState('Rhaehan', { shortDesc: 'a sunburnt man' }, charactersDir);
        assert.match(remember(world, ['jerk'], alice), /Looks like: a sunburnt man\n {2}When you named them: a bearded man/);
        assert.match(remember(world, [], alice), /You remember:\n {2}Jerk \(a bearded man\) - 0 notes/);
    }

    // Memories and short descriptions are saved with the character
    {
        const { world, alice } = setup();
        remember(world, ['bearded', 'Jerk'], alice);
        remember(world, ['jerk', 'hmm'], alice);
        const restored = new Character('Alice');
        restored.restoreFrom(JSON.parse(JSON.stringify(alice.toSaveData())));
        assert.equal(restored.shortDesc, 'a tall woman');
        assert.equal(restored.memories.rhaehan.name, 'Jerk');
        assert.equal(restored.memories.rhaehan.notes[0].text, 'hmm');
    }

    // shortdesc with no args shows it
    {
        const { world, alice } = setup();
        assert.match(shortdesc(world, [], alice), /Strangers see you as "a tall woman"/);
        alice.shortDesc = null;
        assert.match(shortdesc(world, [], alice), /don't have a short description yet/);
    }

    // Login asks for a short description: new characters after their long
    // description, existing ones without one before they enter
    {
        mock.method(console, 'warn', () => {});
        const world = new World();
        const startingRoomKey = world.addRoom('Start', 'The start.', 'start');
        const handleLogin = createLoginHandler({ world, startingRoomKey, charactersDir });
        const connect = () => {
            const socket = { messages: [], write(m) { this.messages.push(m); }, end() { this.ended = true; } };
            socket.character = new Character();
            socket.character.socket = socket;
            return socket;
        };
        const send = (socket, ...lines) => lines.reduce((_, line) => handleLogin(socket, line), undefined);

        const fresh = connect();
        assert.match(send(fresh, 'Newcomer', 'pw', 'A long description.'), /Enter a short description/);
        assert.match(send(fresh, 'Newcomer the bold'), /can't include your name.*Enter a short description/);
        assert.match(send(fresh, 'a nervous young man'), /Welcome, Newcomer!/);
        assert.equal(fresh.character.shortDesc, 'a nervous young man');
        assert.equal(loadCharacterState('Newcomer', charactersDir).shortDesc, 'a nervous young man');
        world.getRoomById('start').removeCharacter(fresh.character);

        // An existing character from before recognition
        const saved = loadCharacterState('Newcomer', charactersDir);
        saveCharacterState('Oldtimer', { ...saved, shortDesc: undefined, description: 'An old hand.' }, charactersDir);
        const old = connect();
        assert.match(send(old, 'Oldtimer', 'pw'), /Welcome back, Oldtimer! Before you go on: Enter a short description/);
        assert.equal(old.character.isLoggedIn, false, 'not in the world yet');
        assert.equal(world.getRoomById('start').characters.length, 0);
        assert.match(send(old, 'a weathered sailor'), /Strangers will see you as "a weathered sailor"/);
        assert.equal(old.character.isLoggedIn, true);
        assert.ok(world.getRoomById('start').characters.includes(old.character));
        world.getRoomById('start').removeCharacter(old.character);

        // With one already: straight in
        const back = connect();
        assert.match(send(back, 'Newcomer', 'pw'), /^Welcome back, Newcomer!\n/);
        mock.restoreAll();
    }

    // features.json: off unless switched on; unknown keys warned about
    {
        assert.deepEqual(loadFeatures(path.join(tmp, 'missing.json')), { recognition: false });
        const file = path.join(tmp, 'features.json');
        fs.writeFileSync(file, JSON.stringify({ recognition: true, jetpacks: true }));
        const warnings = [];
        mock.method(console, 'warn', (...args) => warnings.push(args.join(' ')));
        assert.deepEqual(loadFeatures(file), { recognition: true });
        mock.restoreAll();
        assert.match(warnings[0], /Unknown feature "jetpacks"/);
        assert.equal(loadFeatures().recognition, true, 'the shipped content turns it on');
    }

    // Off again: real names, as before
    {
        disableRecognition();
        const { alice, rhaehan } = setup();
        assert.equal(nameFor(rhaehan, alice), 'Rhaehan');
    }
} finally {
    disableRecognition();
    fs.rmSync(tmp, { recursive: true, force: true });
}

console.log('All tests passed');
