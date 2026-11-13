import assert from 'assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { World } from '../modules/World.js';
import { readGame, contentDirsOf, setUpPackCode, defaultContentDirs } from '../modules/packs/game.js';
import { registerCommand, resolveCommand } from '../modules/commands/registry.js';
import { registerBehavior, hasBehavior } from '../modules/npcs/behaviors.js';
import { loadWorldData } from '../modules/content/loadWorldData.js';
import { loadStatDefinitions, getStatDefinitions, getStatKeyForRole } from '../modules/content/loadStatDefinitions.js';
import { loadTimeSettings, getPhaseStartHour, getGameTime } from '../modules/gameClock.js';
import { loadFeatures } from '../modules/content/loadFeatures.js';
import { emit } from '../modules/events.js';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'packs-'));
const gamesDir = path.join(tmp, 'games');
const packsDir = path.join(tmp, 'packs');

// Write files under tmp from { 'relative/path': contents } (objects become JSON)
function write(files) {
    for (const [rel, contents] of Object.entries(files)) {
        const file = path.join(tmp, rel);
        fs.mkdirSync(path.dirname(file), { recursive: true });
        fs.writeFileSync(file, typeof contents === 'string' ? contents : JSON.stringify(contents));
    }
}
const pack = (name, extra = {}) => ({ [`packs/${name}/pack.json`]: { name, version: '1.0.0' }, ...extra });
const read = (name) => readGame(name, { gamesDir, packsDir });
const quiet = (fn) => {
    const original = console.warn;
    console.warn = () => {};
    try {
        return fn();
    } finally {
        console.warn = original;
    }
};

try {
    // A game is an ordered list of packs; each pack's content/ and index.js
    // are optional
    {
        write({
            'games/two.json': { packs: ['base', 'theme'], startingRoom: 'town/gate' },
            ...pack('base', { 'packs/base/content/items.json': [] }),
            ...pack('theme', { 'packs/theme/index.js': 'export default () => {};' }),
        });
        const game = read('two');
        assert.equal(game.name, 'two');
        assert.equal(game.startingRoom, 'town/gate');
        assert.deepEqual(
            game.packs.map((p) => p.name),
            ['base', 'theme'],
        );
        assert.equal(game.packs[0].codeFile, null);
        assert.equal(game.packs[1].contentDir, null);
        assert.deepEqual(contentDirsOf(game), [path.join(packsDir, 'base', 'content')]);
    }

    // Bad configs fail loudly with the reason
    {
        write({
            'games/empty.json': { packs: [] },
            'games/twice.json': { packs: ['base', 'base'] },
            'games/missing.json': { packs: ['ghost'] },
            'games/misnamed.json': { packs: ['misnamed'] },
            'packs/misnamed/pack.json': { name: 'something-else' },
        });
        assert.throws(() => read('empty'), /non-empty "packs" list/);
        assert.throws(() => read('twice'), /lists pack "base" twice/);
        assert.throws(() => read('missing'), /Couldn't read pack "ghost"'s manifest/);
        assert.throws(() => read('misnamed'), /manifest named "something-else"/);
        assert.throws(() => read('nope'), /Couldn't read game "nope"/);
        assert.throws(() => read('../escape'), /Invalid game name/);
    }

    // The shipped default game: the starter pack, which the loaders use when
    // not told otherwise
    {
        const game = readGame('default');
        assert.deepEqual(
            game.packs.map((p) => p.name),
            ['starter', 'combat'],
        );
        assert.equal(game.startingRoom, 'start/starting-room');
        assert.deepEqual(defaultContentDirs(), contentDirsOf(game));
    }

    // Commands: a clash is an error unless the later one overrides, which
    // keeps the original's abbreviation priority; overriding nothing is an
    // error too
    {
        registerCommand('zzalpha', () => 'first');
        registerCommand('zzalphabet', () => 'other');
        assert.throws(
            () => registerCommand('zzalpha', () => 'again'),
            /already registered \(pass \{ override: true \}/,
        );
        registerCommand('zzalpha', () => 'replaced', { override: true });
        assert.equal(resolveCommand('zzal').handler(), 'replaced', 'still first in line for the abbreviation');
        assert.throws(() => registerCommand('zznothing', () => 1, { override: true }), /nothing registered it yet/);

        registerCommand('zzstrict', () => 1, { abbreviate: false });
        registerCommand('zzstrict', () => 2, { override: true });
        assert.equal(resolveCommand('zzstr'), undefined, 'an override keeps abbreviate: false unless told otherwise');
    }

    // Behaviors: the same rules
    {
        registerBehavior('zz-behave', () => true);
        assert.throws(() => registerBehavior('zz-behave', () => true), /already registered/);
        registerBehavior('zz-behave', () => false, { override: true });
        assert.throws(() => registerBehavior('zz-none', () => true, { override: true }), /nothing registered it yet/);
    }

    // Pack code runs in game order through a context; its errors name the pack
    {
        write({
            'games/coded.json': { packs: ['first', 'second'] },
            ...pack('first', {
                'packs/first/index.js': `
                    export default (pack) => {
                        pack.registerCommand('zzhowdy', () => 'Howdy from ' + pack.name);
                        pack.registerBehavior('zz-spin', () => true);
                        pack.on('zz-event', ({ log }) => log.push(pack.name));
                    };`,
            }),
            ...pack('second', {
                'packs/second/index.js': `
                    export default (pack) => {
                        pack.registerCommand('zzhowdy', () => 'Well howdy, partner', { override: true });
                    };`,
            }),
            'games/broken.json': { packs: ['clashing'] },
            ...pack('clashing', {
                'packs/clashing/index.js': `export default (pack) => { pack.registerCommand('zzhowdy', () => 'mine'); };`,
            }),
            'games/nodefault.json': { packs: ['nodefault'] },
            ...pack('nodefault', { 'packs/nodefault/index.js': 'export const x = 1;' }),
        });
        const world = new World();
        await setUpPackCode(read('coded'), world);
        assert.equal(resolveCommand('zzhowdy').handler(), 'Well howdy, partner');
        assert.ok(hasBehavior('zz-spin'));
        const log = [];
        emit('zz-event', { log });
        assert.deepEqual(log, ['first']);

        await assert.rejects(
            setUpPackCode(read('broken'), world),
            /Pack "clashing" failed to set up: Pack "clashing": Command "zzhowdy" is already registered/,
        );
        await assert.rejects(setUpPackCode(read('nodefault'), world), /must export a default setup function/);
    }

    // World content from several packs: items merge (override to replace),
    // zones are each pack's own, exits cross packs, the game's startingRoom wins
    {
        const room = (key, extra = {}) => ({ key, name: key, ...extra });
        write({
            ...pack('w-base', {
                'packs/w-base/content/items.json': [
                    { key: 'hat', name: 'a plain hat', keywords: ['hat'] },
                    { key: 'rope', name: 'a rope', keywords: ['rope'] },
                ],
                'packs/w-base/content/zones/town/zone.json': { name: 'Town' },
                'packs/w-base/content/zones/town/rooms.json': [
                    room('gate', { isStartingRoom: true, exits: { east: 'desert/dune' }, items: ['hat'] }),
                ],
            }),
            ...pack('w-theme', {
                'packs/w-theme/content/items.json': [
                    { key: 'hat', name: 'a dusty stetson', keywords: ['stetson', 'hat'], override: true },
                    { key: 'spurs', name: 'a pair of spurs', keywords: ['spurs'] },
                ],
                'packs/w-theme/content/zones/desert/zone.json': { name: 'Desert' },
                'packs/w-theme/content/zones/desert/rooms.json': [
                    room('dune', { exits: { west: 'town/gate' }, items: ['rope', 'spurs'] }),
                ],
            }),
        });
        const dirs = [path.join(packsDir, 'w-base', 'content'), path.join(packsDir, 'w-theme', 'content')];
        const world = new World();
        const { startingRoomKey } = loadWorldData(world, dirs, { startingRoom: 'desert/dune' });
        assert.equal(startingRoomKey, 'desert/dune', "the game's choice beats the pack's flag");
        assert.equal(world.getRoomById('town/gate').exits.east, 'desert/dune');
        assert.equal(world.getRoomById('desert/dune').exits.west, 'town/gate');
        assert.deepEqual(
            world.getRoomById('town/gate').inventory.map((i) => i.name),
            ['a dusty stetson'],
            'the override replaced it everywhere',
        );
        assert.deepEqual(
            world.getRoomById('desert/dune').inventory.map((i) => i.name),
            ['a rope', 'a pair of spurs'],
        );

        assert.equal(loadWorldData(new World(), dirs).startingRoomKey, 'town/gate', 'no game choice: the flag');
        assert.throws(
            () => loadWorldData(new World(), dirs, { startingRoom: 'nowhere/at-all' }),
            /startingRoom "nowhere\/at-all" isn't a room/,
        );

        write({
            ...pack('w-clash', {
                'packs/w-clash/content/items.json': [{ key: 'rope', name: 'another rope' }],
                'packs/w-clash/content/zones/town/zone.json': { name: 'Other Town' },
                'packs/w-clash/content/zones/town/rooms.json': [room('gate')],
            }),
            ...pack('w-badover', {
                'packs/w-badover/content/items.json': [{ key: 'lasso', name: 'a lasso', override: true }],
            }),
        });
        const clash = path.join(packsDir, 'w-clash', 'content');
        assert.throws(
            () => loadWorldData(new World(), [dirs[0], clash]),
            /Duplicate item key "rope": defined by both "w-base" and "w-clash"/,
        );
        fs.writeFileSync(path.join(clash, 'items.json'), '[]');
        assert.throws(
            () => loadWorldData(new World(), [dirs[0], clash]),
            /Zone "town" is defined by both "w-base" and "w-clash"/,
        );
        assert.throws(
            () => loadWorldData(new World(), [dirs[0], path.join(packsDir, 'w-badover', 'content')]),
            /"lasso" in "w-badover" is marked "override" but nothing defines it earlier/,
        );
    }

    // Stats merge across packs (every .json in stats/); roles stay unique
    {
        write({
            'packs/s-base/content/stats/attributes.json': [
                { key: 'grit', label: 'Grit', startingValue: 5 },
                { key: 'hp', label: 'Health', startingValue: 10, role: 'vitality' },
            ],
            'packs/s-theme/content/stats/western.json': [
                { key: 'aim', label: 'Aim', startingValue: 3, role: 'offense' },
                { key: 'hp', label: 'Hit Points', startingValue: 12, role: 'vitality', override: true },
            ],
            'packs/s-clash/content/stats/more.json': [
                { key: 'luck', label: 'Luck', startingValue: 1, role: 'offense' },
            ],
        });
        const stats = (...names) => names.map((n) => path.join(packsDir, n, 'content', 'stats'));
        loadStatDefinitions(stats('s-base', 's-theme'));
        assert.deepEqual(
            getStatDefinitions().map((d) => `${d.key}:${d.startingValue}`),
            ['grit:5', 'hp:12', 'aim:3'],
        );
        assert.equal(getStatKeyForRole('offense'), 'aim');
        assert.throws(() => loadStatDefinitions(stats('s-base', 's-theme', 's-clash')), /Duplicate role "offense"/);
        loadStatDefinitions(); // back to the shipped default
        assert.equal(getStatKeyForRole('vitality'), 'hp');
    }

    // Time: the last pack with a time.json wins outright; none means real
    // time with no phases. Features merge, later packs winning.
    {
        write({
            'packs/t-base/content/time.json': { speed: 4, phases: [{ name: 'dawn', startHour: 5 }] },
            'packs/t-base/content/features.json': { recognition: true },
            'packs/t-theme/content/time.json': { speed: 2, phases: [{ name: 'high-noon', startHour: 12 }] },
            'packs/t-theme/content/features.json': { recognition: false },
            'packs/t-none/content/items.json': [],
        });
        const dirs = (...names) => names.map((n) => path.join(packsDir, n, 'content'));
        loadTimeSettings(dirs('t-base', 't-theme', 't-none'));
        assert.equal(getPhaseStartHour('high-noon'), 12);
        assert.equal(getPhaseStartHour('dawn'), null, 'phases are not merged');
        loadTimeSettings(dirs('t-none'));
        assert.equal(getGameTime().phase, null);

        assert.deepEqual(loadFeatures(dirs('t-base')), { recognition: true });
        assert.deepEqual(loadFeatures(dirs('t-base', 't-theme')), { recognition: false });
        assert.deepEqual(
            quiet(() => loadFeatures(dirs('t-none'))),
            { recognition: false },
        );
        loadTimeSettings();
    }
} finally {
    fs.rmSync(tmp, { recursive: true, force: true });
}

console.log('All tests passed');
