// The combat pack as a whole, set up through its real setup() the way a game
// does: its verbs, how it plugs into core (quit blocker, leaving the world,
// per-viewer names), and the stats it adds.
import assert from 'assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';
import '../../../modules/commands/index.js'; // core verbs first, as in a game, for abbreviation order
import { World } from '../../../modules/World.js';
import { Character } from '../../../modules/Character.js';
import { Npc } from '../../../modules/Npc.js';
import { createPackContext } from '../../../modules/packs/context.js';
import { resolveCommand } from '../../../modules/commands/registry.js';
import { disconnectCharacter, quit } from '../../../modules/commands/quit.js';
import { setNamingPolicy, resetNamingPolicy } from '../../../modules/naming.js';
import { emit } from '../../../modules/events.js';
import { reset } from '../../../modules/scheduler.js';
import { initStat } from '../../../modules/stats.js';
import {
    loadStatDefinitions,
    getStatKeyForRole,
    getStatDefinitions,
} from '../../../modules/content/loadStatDefinitions.js';
import { loadCharacterState } from '../../../data.js';
import { stripColors } from '../../../modules/color.js';
import setup from '../index.js';
import { engageCombat, getSession } from '../lib/session.js';
import { kill } from '../lib/kill.js';

const packDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const packsDir = path.join(packDir, '..');
const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'combat-pack-'));
const saveDirs = { charactersDir: path.join(tempDir, 'characters'), roomsDir: path.join(tempDir, 'rooms') };

loadStatDefinitions(); // the default game: starter + combat
const world = new World();
setup(createPackContext({ name: 'combat', dir: packDir, manifest: {} }, world));

function fighter(name, room) {
    const character = new Character(name, `${name}.`);
    initStat(character, 'hp', 10);
    character.socket = {
        messages: [],
        write(m) {
            this.messages.push(stripColors(m).trim());
        },
        end() {},
    };
    room.addCharacter(character);
    return character;
}
const last = (character) => character.socket.messages.at(-1);

try {
    // Its verbs: kill must be typed in full; f and di still reach flee and
    // disengage after core's verbs
    {
        assert.equal(resolveCommand('kill').name, 'kill');
        assert.equal(resolveCommand('k'), undefined);
        assert.equal(resolveCommand('kil'), undefined);
        assert.equal(resolveCommand('f').name, 'flee');
        assert.equal(resolveCommand('di').name, 'disengage');
    }

    // NPCs can't be attacked; targets and messages follow the viewer's names
    {
        const room = world.getRoomById(world.addRoom('Hall', 'A hall.', 'hall'));
        const alice = fighter('Alice', room);
        const bob = fighter('Bob', room);
        const carol = fighter('Carol', room);
        room.addCharacter(new Npc({ id: 'z/cat', name: 'a scruffy cat' }, 'hall'));
        assert.equal(kill(world, ['scruffy'], alice), "You can't attack a scruffy cat.");

        const aliases = { Alice: 'a tall woman', Bob: 'a short man', Carol: 'a stout dwarf' };
        setNamingPolicy({
            nameFor: (subject, viewer) => `${aliases[subject.name] ?? subject.name} (to ${viewer?.name})`,
            keywordsFor: (subject) => (aliases[subject.name] ?? subject.name).split(' '),
        });
        assert.equal(kill(world, ['bob'], alice), "You don't see them here.", 'real names do not resolve');
        emit('attack', { attacker: alice, defender: bob, hit: false });
        assert.equal(last(alice), 'You swing at a short man (to Alice) and miss.');
        assert.equal(last(bob), 'A tall woman (to Bob) swings at you and misses.');
        assert.equal(last(carol), 'A tall woman (to Carol) swings at a short man (to Carol) and misses.');
        resetNamingPolicy();
        for (const c of [alice, bob, carol]) room.removeCharacter(c);
    }

    // Mid-fight: quit is refused; leaving any way ends the fight for both
    // (the opponent is told) and no combat state is saved
    {
        const room = world.getRoomById(world.addRoom('Arena', 'An arena.', 'arena'));
        const a = fighter('Quitter', room);
        const b = fighter('Foe', room);
        engageCombat(a, b);
        assert.match(quit(world, [], a, a.socket), /can't quit in the middle of a fight/);
        assert.ok(room.characters.includes(a));

        disconnectCharacter(world, a, 'Quitter has disconnected.', saveDirs);
        assert.equal(getSession(a), undefined);
        assert.equal(getSession(b), undefined, 'a lone opponent is out of combat too');
        assert.ok(b.socket.messages.some((m) => m.includes('Quitter is gone - you are no longer fighting.')));
        assert.equal(loadCharacterState('Quitter', saveDirs.charactersDir).components.combat, undefined);
    }

    // Its stats: hp (vitality) plus combat roles on the starter attributes. A
    // game without this pack has neither.
    {
        assert.equal(getStatKeyForRole('vitality'), 'hp');
        assert.equal(getStatKeyForRole('offense'), 'strength');
        assert.equal(getStatKeyForRole('defense'), 'dexterity');

        loadStatDefinitions([path.join(packsDir, 'starter', 'content', 'stats')]);
        assert.ok(!getStatDefinitions().some((d) => d.key === 'hp'));
        assert.equal(getStatKeyForRole('offense'), undefined);
        loadStatDefinitions();
    }
} finally {
    reset();
    resetNamingPolicy();
    fs.rmSync(tempDir, { recursive: true, force: true });
}

console.log('All tests passed');
