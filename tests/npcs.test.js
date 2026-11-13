import assert from 'assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { World } from '../modules/World.js';
import { Character } from '../modules/Character.js';
import { Npc } from '../modules/Npc.js';
import { Item } from '../modules/Item.js';
import '../modules/npcs/index.js';
import { registerBehavior, pulseNpc, startNpcBehaviors, NPC_PULSE_MS } from '../modules/npcs/behaviors.js';
import { loadWorldData } from '../modules/content/loadWorldData.js';
import { saveCharacters } from '../modules/worldPersistence.js';
import { findInWorldCharacter } from '../modules/connection.js';
import { characterExists } from '../data.js';
import { give } from '../modules/commands/give.js';
import { look } from '../modules/commands/look.js';
import { advance, reset } from '../modules/scheduler.js';
import { stripColors } from '../modules/color.js';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'npcs-'));
const quiet = (fn) => {
    const { warn, error } = console;
    const warnings = [];
    console.warn = (...args) => warnings.push(args.join(' '));
    console.error = () => {};
    try {
        fn();
    } finally {
        console.warn = warn;
        console.error = error;
    }
    return warnings;
};

function player(name, room) {
    const character = new Character(name);
    character.socket = {
        messages: [],
        write(m) {
            this.messages.push(stripColors(m).trim());
        },
    };
    room.addCharacter(character);
    return character;
}

// Two zones: a town of two rooms, and the woods next door
function townWorld() {
    const world = new World();
    world.addZone('town', { name: 'Town' });
    world.addZone('woods', { name: 'Woods' });
    const rooms = {};
    for (const id of ['town/square', 'town/lane', 'woods/edge']) {
        world.addRoom(id, `The ${id}.`, id);
        rooms[id] = world.getRoomById(id);
        rooms[id].zone = id.split('/')[0];
    }
    rooms['town/square'].exits = { north: 'town/lane', east: 'woods/edge' };
    rooms['town/lane'].exits = { south: 'town/square' };
    rooms['woods/edge'].exits = { west: 'town/square' };
    return { world, rooms };
}

function spawn(world, room, template) {
    const npc = new Npc({ id: `test/${template.key ?? 'npc'}`, ...template }, room.id);
    room.addCharacter(npc);
    world.npcs.push(npc);
    return npc;
}

try {
    // Keywords default to the name's words minus articles; content can
    // set its own
    {
        assert.deepEqual(new Npc({ id: 'z/a', name: 'an old groundskeeper' }, 'z/r').keywords, [
            'old',
            'groundskeeper',
        ]);
        assert.deepEqual(new Npc({ id: 'z/a', name: 'Marla', keywords: ['Marla', 'innkeeper'] }, 'z/r').keywords, [
            'marla',
            'innkeeper',
        ]);
        const npc = new Npc({ id: 'z/a', name: 'a cat' }, 'z/r');
        assert.equal(npc.isNpc, true);
        assert.equal(npc.homeRoomId, 'z/r');
        assert.equal(new Character('Bob').isNpc, false);
    }

    // The loader spawns NPCs from each zone's npcs.json into rooms that list
    // them (bare key = same zone, zone/key = another zone), and warns about
    // unknown NPCs and unknown behaviors
    {
        const dir = path.join(tmp, 'content');
        const zone = (key, rooms, npcs) => {
            fs.mkdirSync(path.join(dir, 'zones', key), { recursive: true });
            fs.writeFileSync(path.join(dir, 'zones', key, 'zone.json'), JSON.stringify({ name: key }));
            fs.writeFileSync(path.join(dir, 'zones', key, 'rooms.json'), JSON.stringify(rooms));
            if (npcs) fs.writeFileSync(path.join(dir, 'zones', key, 'npcs.json'), JSON.stringify(npcs));
        };
        fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(path.join(dir, 'items.json'), '[]');
        zone(
            'town',
            [{ key: 'square', name: 'Square', isStartingRoom: true, npcs: ['cat', 'cat', 'woods/owl', 'ghost'] }],
            [{ key: 'cat', name: 'a cat', behaviors: { wander: { chance: 0.1 }, juggle: { chance: 1 } } }],
        );
        zone('woods', [{ key: 'edge', name: 'Edge' }], [{ key: 'owl', name: 'an owl', description: 'Hoo.' }]);

        const world = new World();
        const warnings = quiet(() => loadWorldData(world, dir));
        const square = world.getRoomById('town/square');

        assert.deepEqual(
            square.characters.map((c) => c.name),
            ['a cat', 'a cat', 'an owl'],
        );
        assert.equal(world.npcs.length, 3);
        assert.notEqual(world.npcs[0], world.npcs[1], 'each listing spawns its own NPC');
        assert.equal(world.npcs[2].templateId, 'woods/owl');
        assert.equal(world.npcs[2].roomId, 'town/square');
        assert.ok(warnings.some((w) => w.includes('unknown behavior "juggle"')));
        assert.ok(warnings.some((w) => w.includes('NPC "ghost"')));
    }

    // wander: moves through an exit within its zone, and other people see it
    // come and go; leaveZone lets it cross into another zone
    {
        const { world, rooms } = townWorld();
        const watcher = player('Watcher', rooms['town/square']);
        const cat = spawn(world, rooms['town/square'], { name: 'a cat', behaviors: { wander: { chance: 1 } } });

        // random() = 0.99 picks the last option; east (the woods) is filtered out
        pulseNpc(cat, world, () => 0.99);
        assert.equal(cat.roomId, 'town/lane', 'stays in town');
        assert.ok(
            watcher.socket.messages.includes('A cat leaves to the north.'),
            'capitalized at the start of the line',
        );

        const lurker = player('Lurker', rooms['town/lane']);
        pulseNpc(cat, world, () => 0);
        assert.equal(cat.roomId, 'town/square');
        assert.ok(watcher.socket.messages.includes('A cat arrives from the north.'));
        assert.ok(lurker.socket.messages.includes('A cat leaves to the south.'));

        cat.behaviors.wander.leaveZone = true;
        pulseNpc(cat, world, () => 0.99);
        assert.equal(cat.roomId, 'woods/edge', 'leaveZone lets it cross over');

        // Nowhere to go (only exit leaves the zone): does nothing
        cat.behaviors.wander.leaveZone = false;
        pulseNpc(cat, world, () => 0);
        assert.equal(cat.roomId, 'woods/edge');
    }

    // ambient: a say or emote line to the room, only when a player is there
    {
        const { world, rooms } = townWorld();
        const keeper = spawn(world, rooms['town/lane'], {
            name: 'an old groundskeeper',
            behaviors: { ambient: { chance: 1, says: ['Mind the moss.'], emotes: ['leans on his rake.'] } },
        });
        pulseNpc(keeper, world, () => 0); // nobody there: nothing, and no error

        const watcher = player('Watcher', rooms['town/lane']);
        pulseNpc(keeper, world, () => 0);
        pulseNpc(keeper, world, () => 0.99);
        assert.deepEqual(watcher.socket.messages, [
            'An old groundskeeper says, "Mind the moss."',
            'An old groundskeeper leans on his rake.',
        ]);
    }

    // At most one action per pulse; a behavior that does nothing passes the
    // pulse on; chance 0 never fires; unknown behaviors are skipped
    {
        const { world, rooms } = townWorld();
        const calls = [];
        registerBehavior('test-noop', () => {
            calls.push('noop');
            return false;
        });
        registerBehavior('test-act', () => {
            calls.push('act');
            return true;
        });
        registerBehavior('test-never', () => {
            calls.push('never');
            return true;
        });
        assert.throws(() => registerBehavior('test-act', () => true), /already registered/);

        const npc = spawn(world, rooms['town/square'], {
            name: 'a busy npc',
            behaviors: {
                'test-noop': { chance: 1 },
                'test-act': { chance: 1 },
                'test-act-twin': { chance: 1 },
                'test-never': { chance: 0 },
            },
        });
        for (let i = 0; i < 20; i++) {
            pulseNpc(npc, world);
        }
        assert.equal(calls.filter((c) => c === 'act').length, 20, 'acts every pulse');
        assert.ok(!calls.includes('never'), 'chance 0 never fires');
        assert.ok(calls.filter((c) => c === 'noop').length < 20, 'sometimes act goes first and ends the pulse');
    }

    // The scheduler pulses every NPC; one broken behavior doesn't stop the rest
    {
        reset();
        const { world, rooms } = townWorld();
        const pulsed = [];
        registerBehavior('test-broken', () => {
            throw new Error('boom');
        });
        registerBehavior('test-count', ({ npc }) => {
            pulsed.push(npc.name);
            return true;
        });
        spawn(world, rooms['town/square'], { name: 'broken', behaviors: { 'test-broken': { chance: 1 } } });
        spawn(world, rooms['town/square'], { name: 'fine', behaviors: { 'test-count': { chance: 1 } } });

        startNpcBehaviors(world);
        quiet(() => advance(NPC_PULSE_MS));
        quiet(() => advance(NPC_PULSE_MS));
        assert.deepEqual(pulsed, ['fine', 'fine']);
        reset();
    }

    // NPCs aren't players: not saved, not taken over by a login with the
    // same name, can't be attacked or handed things; but can be looked at
    {
        const { world, rooms } = townWorld();
        const square = rooms['town/square'];
        const bob = player('Bob', square);
        spawn(world, square, { name: 'Marla', description: 'A cheerful innkeeper.' });

        const charactersDir = path.join(tmp, 'characters');
        saveCharacters(world, charactersDir);
        assert.equal(characterExists('Bob', charactersDir), true);
        assert.equal(characterExists('Marla', charactersDir), false, 'NPCs are not saved');

        assert.equal(
            findInWorldCharacter(world, 'marla'),
            null,
            'logging in as "Marla" makes a player, not a takeover',
        );
        assert.equal(findInWorldCharacter(world, 'bob'), bob);

        bob.inventory.push(new Item('a pouch', 'A pouch.', ['pouch']));
        assert.equal(give(world, ['pouch', 'marla'], bob), "Marla doesn't take it.");
        assert.equal(bob.inventory.length, 1, 'still has it');

        assert.match(stripColors(look(world, [], bob)), /\nMarla is here\./);
        assert.equal(look(world, ['marla'], bob), 'You look at Marla: A cheerful innkeeper.');
    }

    // The shipped content loads its NPCs
    {
        const world = new World();
        loadWorldData(world);
        assert.ok(
            world.getRoomById('grounds/courtyard').characters.some((c) => c.templateId === 'grounds/groundskeeper'),
        );
        assert.ok(world.npcs.some((n) => n.templateId === 'start/cat'));
    }
} finally {
    reset();
    fs.rmSync(tmp, { recursive: true, force: true });
}

console.log('All tests passed');
