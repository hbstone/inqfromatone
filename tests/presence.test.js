import assert from 'assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { World } from '../modules/World.js';
import { Character } from '../modules/Character.js';
import { Npc } from '../modules/Npc.js';
import { presence, presenceOf, presenceLine, normalizePresence } from '../modules/presence.js';
import { look } from '../modules/commands/look.js';
import { movePlayer } from '../modules/commands/move.js';
import { disconnectCharacter } from '../modules/commands/quit.js';
import { loadTimeSettings } from '../modules/gameClock.js';
import { loadWorldData } from '../modules/content/loadWorldData.js';
import { enableRecognition, disableRecognition } from '../modules/recognition/index.js';
import { remember } from '../modules/recognition/commands.js';
import { stripColors } from '../modules/color.js';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'presence-'));
const timeFile = path.join(tmp, 'time.json');
fs.writeFileSync(
    timeFile,
    JSON.stringify({
        speed: 1,
        phases: [
            { name: 'dawn', startHour: 5 },
            { name: 'night', startHour: 21 },
        ],
    }),
);
loadTimeSettings(timeFile);

function setup() {
    const world = new World();
    const hall = world.getRoomById(world.addRoom('Hall', 'A hall.', 'hall'));
    const yard = world.getRoomById(world.addRoom('Yard', 'A yard.', 'yard'));
    hall.exits.north = 'yard';
    yard.exits.south = 'hall';
    const make = (name, room = hall) => {
        const character = new Character(name, `${name}.`);
        character.socket = {
            messages: [],
            write(m) {
                this.messages.push(stripColors(m).trim());
            },
        };
        room.addCharacter(character);
        return character;
    };
    return { world, hall, yard, make };
}

try {
    // Tidying: first letter lowercased (it follows a name), period added
    // after a letter or digit, length capped
    {
        assert.deepEqual(normalizePresence('  Sweeps   the cobblestone with a worn broom '), {
            value: 'sweeps the cobblestone with a worn broom.',
        });
        assert.deepEqual(normalizePresence('is lost in thought...'), { value: 'is lost in thought...' });
        assert.deepEqual(
            normalizePresence('I-shaped shadow looms'),
            { value: 'I-shaped shadow looms.' },
            'a lone capital (I, acronyms) is left alone',
        );
        assert.match(normalizePresence('').error, /Usage/);
        assert.match(normalizePresence('x'.repeat(121)).error, /too long/);
    }

    // look: one line each, presence or "is here.", yourself left out
    {
        const { world, make } = setup();
        const alice = make('Alice');
        const bob = make('Bob');
        make('Carol');
        assert.equal(presence(world, ['sweeps', 'the', 'floor'], bob), 'Your presence is now: "sweeps the floor."');
        assert.equal(
            stripColors(look(world, [], alice)),
            'Hall\nA hall.\nExits: north\nBob sweeps the floor.\nCarol is here.\nItems here: None',
        );
        assert.match(presence(world, [], bob), /Your presence: "sweeps the floor\."/);
        assert.equal(presence(world, ['clear'], bob), 'You clear your presence.');
        assert.match(stripColors(look(world, [], alice)), /\nBob is here\.\n/);
        assert.match(presence(world, [], bob), /no presence set/);
    }

    // Presence clears on leaving the room, and on quitting; walking in shows
    // the same lines
    {
        const { world, hall, yard, make } = setup();
        const alice = make('Alice', yard);
        const bob = make('Bob');
        presence(world, ['leans', 'on', 'the', 'wall'], alice);
        const arrival = stripColors(movePlayer(world, bob, hall, 'north', 'south'));
        assert.match(arrival, /\nAlice leans on the wall\.$/);

        presence(world, ['waits'], bob);
        movePlayer(world, bob, yard, 'south', 'north');
        assert.equal(bob.presence, null, 'cleared on leaving');

        const saveDirs = { roomsDir: path.join(tmp, 'rooms'), charactersDir: path.join(tmp, 'characters') };
        disconnectCharacter(world, alice, 'Alice has left the game.', saveDirs);
        assert.equal(alice.presence, null, 'cleared on quitting');
        assert.ok(!('presence' in alice.toSaveData()), 'never saved');
    }

    // With recognition, the line uses the name the viewer knows
    {
        enableRecognition();
        const { world, make } = setup();
        const alice = make('Alice');
        const bob = make('Bob');
        alice.shortDesc = 'a tall woman';
        bob.shortDesc = 'a bearded man';
        presence(world, ['sweeps', 'the', 'floor'], bob);
        assert.equal(presenceLine(bob, alice), 'A bearded man sweeps the floor.');
        remember(world, ['bearded', 'Insolent', 'Jerk'], alice);
        assert.equal(presenceLine(bob, alice), 'Insolent Jerk sweeps the floor.');
        disableRecognition();
    }

    // NPCs: the template's presence; a routine post's own while at it;
    // nothing special while walking there
    {
        const { world, hall } = setup();
        const cat = new Npc({ id: 'z/cat', name: 'a grey cat', presence: 'naps in a sunbeam.' }, 'hall');
        hall.addCharacter(cat);
        assert.equal(presenceOf(cat, 12), 'naps in a sunbeam.');

        const keeper = new Npc(
            {
                id: 'z/keeper',
                name: 'an old keeper',
                presence: 'rakes leaves.',
                routine: [
                    { from: 'dawn', roomId: 'yard' },
                    { from: 'night', roomId: 'hall', presence: 'snores on the sacks.' },
                ],
            },
            'yard',
        );
        world.getRoomById('yard').addCharacter(keeper);
        assert.equal(presenceOf(keeper, 12), 'rakes leaves.', 'at a post without its own: the template one');
        assert.equal(presenceOf(keeper, 23), null, 'night, but still in the yard: on the way');
        world.getRoomById('yard').removeCharacter(keeper);
        hall.addCharacter(keeper);
        assert.equal(presenceOf(keeper, 23), 'snores on the sacks.');
        assert.equal(presenceLine(keeper, null, 23), 'An old keeper snores on the sacks.');
    }

    // The shipped content's NPCs have presences
    {
        const world = new World();
        loadWorldData(world);
        const keeper = world.npcs.find((n) => n.templateId === 'grounds/groundskeeper');
        assert.equal(keeper.basePresence, 'rakes leaves into tidy piles.');
        assert.equal(keeper.routine[1].presence, 'snores softly on a pile of sacks.');
    }
} finally {
    disableRecognition();
    loadTimeSettings();
    fs.rmSync(tmp, { recursive: true, force: true });
}

console.log('All tests passed');
