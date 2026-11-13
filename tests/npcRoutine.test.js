import assert from 'assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { World } from '../modules/World.js';
import { Character } from '../modules/Character.js';
import { Npc } from '../modules/Npc.js';
import '../modules/npcs/index.js';
import { registerBehavior, pulseNpc, startNpcBehaviors } from '../modules/npcs/behaviors.js';
import { currentRoutineEntry, firstStepToward, settleAtPosts } from '../modules/npcs/routine.js';
import { loadTimeSettings } from '../modules/gameClock.js';
import { loadWorldData } from '../modules/content/loadWorldData.js';
import { reset } from '../modules/scheduler.js';
import { stripColors } from '../modules/color.js';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'npc-routine-'));
const timeFile = path.join(tmp, 'time.json');
fs.writeFileSync(
    timeFile,
    JSON.stringify({
        speed: 1,
        phases: [
            { name: 'dawn', startHour: 5 },
            { name: 'dusk', startHour: 18 },
            { name: 'night', startHour: 21 },
        ],
    }),
);
loadTimeSettings(timeFile);

function captureWarnings(fn) {
    const original = console.warn;
    const warnings = [];
    console.warn = (...args) => warnings.push(args.join(' '));
    try {
        fn();
    } finally {
        console.warn = original;
    }
    return warnings;
}

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

// A line of rooms: yard - hall - store, plus a shortcut-less loop hall - attic
// reachable only by "up" (not a direction movement understands), and an
// island with no way in
function lineWorld() {
    const world = new World();
    for (const id of ['z/yard', 'z/hall', 'z/store', 'z/attic', 'z/island']) {
        world.addRoom(id, `The ${id}.`, id);
    }
    const room = (id) => world.getRoomById(id);
    room('z/yard').exits = { north: 'z/hall' };
    room('z/hall').exits = { south: 'z/yard', west: 'z/store', up: 'z/attic' };
    room('z/store').exits = { east: 'z/hall' };
    return { world, room };
}

function spawn(world, roomId, template) {
    const npc = new Npc({ id: 'z/npc', name: 'a keeper', ...template }, roomId);
    world.getRoomById(roomId).addCharacter(npc);
    world.npcs.push(npc);
    return npc;
}

try {
    // The entry in effect: latest started by the hour, by number or phase;
    // before the first, the last carries over; unknown phases are skipped
    {
        const routine = [
            { from: 'night', at: 'bed' },
            { from: 'dawn', at: 'yard' },
            { from: 12, at: 'lunch' },
            { from: 'teatime', at: 'nowhere' },
        ];
        const at = (hour) => currentRoutineEntry(routine, hour).at;
        assert.equal(at(3), 'bed', 'before dawn, last night carries over');
        assert.equal(at(5), 'yard');
        assert.equal(at(11), 'yard');
        assert.equal(at(12), 'lunch');
        assert.equal(at(20), 'lunch');
        assert.equal(at(21), 'bed');
        assert.equal(currentRoutineEntry([{ from: 'teatime' }], 9), null, 'nothing valid, nothing in effect');
    }

    // Pathfinding: first step of a shortest path; null when there's no way,
    // when already there, or when the only way is a non-cardinal exit
    {
        const { world } = lineWorld();
        assert.equal(firstStepToward(world, 'z/yard', 'z/store'), 'north');
        assert.equal(firstStepToward(world, 'z/hall', 'z/store'), 'west');
        assert.equal(firstStepToward(world, 'z/store', 'z/yard'), 'east');
        assert.equal(firstStepToward(world, 'z/yard', 'z/yard'), null);
        assert.equal(firstStepToward(world, 'z/yard', 'z/island'), null);
        assert.equal(firstStepToward(world, 'z/yard', 'z/attic'), null, '"up" is not walkable yet');
        assert.equal(firstStepToward(world, 'z/yard', 'z/missing'), null);
    }

    // Away from its post, the NPC walks one room per pulse, seen by others;
    // at its post, the entry's behaviors run instead of its usual ones
    {
        const { world, room } = lineWorld();
        const done = [];
        registerBehavior('test-usual', () => {
            done.push('usual');
            return true;
        });
        registerBehavior('test-at-post', () => {
            done.push('post');
            return true;
        });

        const keeper = spawn(world, 'z/yard', {
            behaviors: { 'test-usual': { chance: 1 } },
            routine: [
                { from: 'dawn', roomId: 'z/yard' },
                { from: 'night', roomId: 'z/store', behaviors: { 'test-at-post': { chance: 1 } } },
            ],
        });
        const watcher = player('Watcher', room('z/hall'));

        pulseNpc(keeper, world, Math.random, 10);
        assert.deepEqual(done, ['usual'], 'at the day post with no post behaviors: usual ones');

        pulseNpc(keeper, world, Math.random, 22); // night: off to the store
        assert.equal(keeper.roomId, 'z/hall');
        assert.deepEqual(done, ['usual'], 'walking takes the whole pulse');
        assert.ok(watcher.socket.messages.includes('A keeper arrives from the south.'));

        pulseNpc(keeper, world, Math.random, 22);
        assert.equal(keeper.roomId, 'z/store');
        assert.ok(watcher.socket.messages.includes('A keeper leaves to the west.'));

        pulseNpc(keeper, world, Math.random, 22);
        assert.deepEqual(done, ['usual', 'post'], 'at the night post: its own behaviors');

        pulseNpc(keeper, world, Math.random, 6); // dawn: back to the yard
        pulseNpc(keeper, world, Math.random, 6);
        assert.equal(keeper.roomId, 'z/yard');
    }

    // No way to the post: stays put, uses its usual behaviors, warns once
    {
        const { world } = lineWorld();
        const done = [];
        registerBehavior('test-fallback', () => {
            done.push('fallback');
            return true;
        });
        const keeper = spawn(world, 'z/yard', {
            behaviors: { 'test-fallback': { chance: 1 } },
            routine: [{ from: 0, roomId: 'z/island' }],
        });
        const warnings = captureWarnings(() => {
            pulseNpc(keeper, world, Math.random, 9);
            pulseNpc(keeper, world, Math.random, 9);
        });
        assert.equal(keeper.roomId, 'z/yard');
        assert.deepEqual(done, ['fallback', 'fallback']);
        assert.equal(warnings.length, 1, 'warned once, not every pulse');
        assert.match(warnings[0], /can't find a way from "z\/yard" to its post "z\/island"/);
    }

    // At startup, routine NPCs go straight to their current post, silently
    {
        const { world, room } = lineWorld();
        const watcher = player('Watcher', room('z/yard'));
        const keeper = spawn(world, 'z/yard', {
            routine: [
                { from: 'night', roomId: 'z/store' },
                { from: 'dawn', roomId: 'z/yard' },
            ],
        });
        const wanderer = spawn(world, 'z/yard', { name: 'a cat' });

        settleAtPosts(world, 23);
        assert.equal(keeper.roomId, 'z/store');
        assert.ok(room('z/store').characters.includes(keeper));
        assert.ok(!room('z/yard').characters.includes(keeper));
        assert.equal(wanderer.roomId, 'z/yard', 'no routine, not moved');
        assert.deepEqual(watcher.socket.messages, [], 'no leave/arrive messages');
    }

    // startNpcBehaviors warns about routine entries keyed to unknown phases
    {
        reset();
        const { world } = lineWorld();
        spawn(world, 'z/yard', {
            routine: [
                { from: 'teatime', roomId: 'z/hall' },
                { from: 'teatime', roomId: 'z/store' },
            ],
        });
        const warnings = captureWarnings(() => startNpcBehaviors(world));
        assert.equal(warnings.length, 1);
        assert.match(warnings[0], /unknown phase "teatime"/);
        reset();
    }

    // The loader resolves `at` like exits (bare = own zone), and drops
    // entries with a missing room or a bad `from`, keeping the rest
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
            [{ key: 'square', name: 'Square', isStartingRoom: true, npcs: ['baker'] }],
            [
                {
                    key: 'baker',
                    name: 'a baker',
                    routine: [
                        { from: 'dawn', at: 'square' },
                        { from: 'night', at: 'home/bed' },
                        { from: 9, at: 'nowhere' },
                        { from: 24, at: 'square' },
                    ],
                },
            ],
        );
        zone('home', [{ key: 'bed', name: 'Bed' }]);

        const world = new World();
        const warnings = captureWarnings(() => loadWorldData(world, dir));
        const [baker] = world.npcs;
        assert.deepEqual(
            baker.routine.map((e) => e.roomId),
            ['town/square', 'home/bed'],
        );
        assert.ok(warnings.some((w) => w.includes('unknown room "town/nowhere"')));
        assert.ok(warnings.some((w) => w.includes('"from" must be an hour')));
    }

    // The shipped groundskeeper keeps a routine
    {
        const world = new World();
        loadWorldData(world);
        const keeper = world.npcs.find((n) => n.templateId === 'grounds/groundskeeper');
        assert.deepEqual(
            keeper.routine.map((e) => e.roomId),
            ['grounds/courtyard', 'start/storage-room'],
        );
    }
} finally {
    reset();
    loadTimeSettings(); // back to the real content
    fs.rmSync(tmp, { recursive: true, force: true });
}

console.log('All tests passed');
