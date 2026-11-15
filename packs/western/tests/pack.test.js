// The western pack as the shipped western game runs it: western then
// combat, with no starter pack. Doubles as the check that a second theme
// runs on the engine without anything from the first.
import assert from 'assert/strict';
import path from 'path';
import '../../../modules/commands/index.js'; // core verbs first, as in a game
import '../../../modules/npcs/index.js'; // core NPC behaviors (wander, ambient)
import '../../../modules/checks/index.js'; // core's default check resolver
import { World } from '../../../modules/World.js';
import { Character } from '../../../modules/Character.js';
import { Item } from '../../../modules/Item.js';
import { readGame, contentDirsOf, setUpPackCode } from '../../../modules/packs/game.js';
import { loadWorldData } from '../../../modules/content/loadWorldData.js';
import {
    loadStatDefinitions,
    getStatDefinitions,
    getStatKeyForRole,
} from '../../../modules/content/loadStatDefinitions.js';
import { loadTimeSettings, getPhaseStartHour } from '../../../modules/gameClock.js';
import { loadFeatures } from '../../../modules/content/loadFeatures.js';
import { resolveCommand } from '../../../modules/commands/registry.js';
import { stripColors } from '../../../modules/color.js';

const game = readGame('western');
const dirs = contentDirsOf(game);
const world = new World();

function person(name, room) {
    const character = new Character(name, `${name}.`);
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
    // The game: western, then combat building on it
    {
        assert.deepEqual(
            game.packs.map((p) => p.name),
            ['western', 'combat'],
        );
        await setUpPackCode(game, world);
        assert.ok(resolveCommand('tip'), "western's verb");
        assert.ok(resolveCommand('kill'), "combat's verbs, on top");
    }

    // Its world, with nothing from the starter pack
    {
        const { startingRoomKey } = loadWorldData(world, dirs, { startingRoom: game.startingRoom });
        assert.equal(startingRoomKey, 'western/dry-creek/main-street');
        assert.deepEqual(
            world
                .getAllRooms()
                .map((r) => r.id)
                .sort(),
            [
                'western/dry-creek/livery',
                'western/dry-creek/main-street',
                'western/dry-creek/saloon',
                'western/dry-creek/trail',
            ],
        );
        assert.deepEqual(world.npcs.map((n) => n.templateId).sort(), [
            'western/dry-creek/bartender',
            'western/dry-creek/dog',
        ]);
        const street = world.getRoomById(startingRoomKey);
        assert.equal(street.exits.north, 'western/dry-creek/saloon');
        assert.equal(world.getRoomById('western/dry-creek/saloon').indoors, true);

        const stetson = world
            .getRoomById('western/dry-creek/livery')
            .inventory.find((i) => i.name === 'a dusty stetson');
        assert.deepEqual(stetson.equip, { slot: 'head' });
    }

    // Its stats, which combat's roles land on; its own day; recognition on
    {
        loadStatDefinitions(dirs.map((dir) => path.join(dir, 'stats')));
        const keys = getStatDefinitions().map((s) => s.key);
        assert.ok(['grit', 'wits', 'charm', 'hp'].every((key) => keys.includes(key)));
        assert.ok(!keys.includes('wisdom'), 'no starter stats');
        assert.equal(getStatKeyForRole('offense'), 'strength');
        assert.equal(getStatKeyForRole('defense'), 'dexterity');
        const dexterity = getStatDefinitions().find((s) => s.key === 'dexterity');
        assert.equal(dexterity.label, 'Quickness', "combat adds a role without replacing the pack's label");
        loadStatDefinitions(); // back to the default game

        loadTimeSettings(dirs);
        assert.equal(getPhaseStartHour('high-noon'), 12);
        loadTimeSettings();

        assert.deepEqual(loadFeatures(dirs), { recognition: true });
    }

    // tip: to the room or to someone, with the hat you're wearing, or a
    // touch to the brow without one
    {
        const tip = resolveCommand('tip').handler;
        const saloon = world.getRoomById('western/dry-creek/saloon');
        const wade = person('Wade', saloon);
        const ida = person('Ida', saloon);
        const cole = person('Cole', saloon);

        assert.equal(tip(world, [], wade), 'You touch two fingers to your brow.');
        assert.equal(last(ida), 'Wade touches two fingers to their brow.');

        wade.equipment.head = new Item('a dusty stetson', 'A hat.', ['stetson'], { equip: { slot: 'head' } });
        assert.equal(tip(world, ['ida'], wade), 'You tip your dusty stetson to Ida.');
        assert.equal(last(ida), 'Wade tips their dusty stetson to you.');
        assert.equal(last(cole), 'Wade tips their dusty stetson to Ida.');

        assert.equal(tip(world, ['nobody'], wade), "You don't see nobody here.");
        assert.equal(tip(world, ['wade'], wade), "You don't see wade here.", 'not to yourself');
    }
} finally {
    loadStatDefinitions();
    loadTimeSettings();
}

console.log('All tests passed');
