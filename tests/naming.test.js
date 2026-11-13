// The naming seam (modules/naming.js): with a policy installed where
// everyone looks different to each viewer, every in-character message must
// name people per viewer, and targeting must match what the viewer sees -
// never the real name. Out-of-character commands keep real names.
import assert from 'assert/strict';
import { World } from '../modules/World.js';
import { Character } from '../modules/Character.js';
import { Npc } from '../modules/Npc.js';
import { Item } from '../modules/Item.js';
import { setNamingPolicy, resetNamingPolicy, nameFor, findCharacter } from '../modules/naming.js';
import '../modules/npcs/index.js';
import { pulseNpc } from '../modules/npcs/behaviors.js';
import { say } from '../modules/commands/say.js';
import { emote } from '../modules/commands/emote.js';
import { look } from '../modules/commands/look.js';
import { give } from '../modules/commands/give.js';
import { drop } from '../modules/commands/drop.js';
import { whisper } from '../modules/commands/whisper.js';
import { tell } from '../modules/commands/tell.js';
import { who } from '../modules/commands/who.js';
import { movePlayer } from '../modules/commands/move.js';
import { stripColors } from '../modules/color.js';

// Each character has an `alias` (think: short description). Others see
// "<alias> (to <viewer>)", so a message shows both that the alias was used
// and that it was built for that particular viewer.
setNamingPolicy({
    nameFor: (subject, viewer) => `${subject.alias} (to ${viewer?.name ?? 'nobody'})`,
    keywordsFor: (subject) => subject.alias.split(' '),
});

function setup() {
    const world = new World();
    const hall = world.getRoomById(world.addRoom('Hall', 'A hall.', 'hall'));
    const yard = world.getRoomById(world.addRoom('Yard', 'A yard.', 'yard'));
    hall.exits.north = 'yard';
    yard.exits.south = 'hall';
    const make = (name, alias, room = hall) => {
        const character = new Character(name, `${name}'s long description.`);
        character.alias = alias;
        character.socket = {
            messages: [],
            write(m) {
                this.messages.push(stripColors(m).trim());
            },
        };
        room.addCharacter(character);
        return character;
    };
    const alice = make('Alice', 'a tall woman');
    const bob = make('Bob', 'a short man');
    const carol = make('Carol', 'a stout dwarf');
    return { world, hall, yard, alice, bob, carol, make };
}
const last = (character) => character.socket.messages.at(-1);

try {
    // You always see your own real name
    {
        const { alice } = setup();
        assert.equal(nameFor(alice, alice), 'Alice');
    }

    // say, drop: each onlooker gets their own version
    {
        const { world, alice, bob, carol } = setup();
        assert.equal(say(world, ['hello'], alice), 'You say, "Hello."');
        assert.equal(last(bob), 'A tall woman (to Bob) says, "Hello."');
        assert.equal(last(carol), 'A tall woman (to Carol) says, "Hello."');

        alice.inventory.push(new Item('a rock', 'A rock.', ['rock']));
        drop(world, ['rock'], alice);
        assert.equal(last(bob), 'A tall woman (to Bob) drops a rock.');
    }

    // Targeting matches what the viewer sees, not real names
    {
        const { world, hall, alice, bob } = setup();
        assert.equal(findCharacter(alice, hall.characters, 'bob'), null);
        assert.equal(findCharacter(alice, hall.characters, 'short'), bob);

        assert.equal(look(world, ['bob'], alice), "You can't find that here.");
        assert.equal(look(world, ['short'], alice), "You look at a short man (to Alice): Bob's long description.");
        assert.equal(last(bob), 'A tall woman (to Bob) looks at you.');
        assert.match(
            stripColors(look(world, [], alice)),
            /\nA short man \(to Alice\) is here\.\nA stout dwarf \(to Alice\) is here\./,
        );
    }

    // emote: the actor and each @target are named per viewer
    {
        const { world, alice, carol } = setup();
        // (no added period: emote only adds one after a letter or digit)
        assert.equal(emote(world, ['waves', 'at', '@short'], alice), 'You waves at a short man (to Alice)');
        assert.equal(last(carol), 'A tall woman (to Carol) waves at a short man (to Carol)');
        emote(world, ['waves', 'at', '@bob'], alice);
        assert.equal(last(carol), 'A tall woman (to Carol) waves at someone.', 'real names do not resolve');
    }

    // give, whisper (kill and combat messages: packs/combat/tests/pack.test.js)
    {
        const { world, alice, bob, carol } = setup();
        alice.inventory.push(new Item('a coin', 'A coin.', ['coin']));
        assert.equal(give(world, ['coin', 'short'], alice), 'You give a coin to a short man (to Alice).');
        assert.equal(last(bob), 'A tall woman (to Bob) gives you a coin.');
        assert.equal(last(carol), 'A tall woman (to Carol) gives a coin to a short man (to Carol).');

        assert.equal(whisper(world, ['short', 'psst'], alice), 'You whisper to a short man (to Alice): "psst"');
        assert.equal(last(bob), 'A tall woman (to Bob) whispers to you, "psst"');
    }

    // Movement: leave and arrive messages
    {
        const { world, hall, alice, bob, make } = setup();
        const dave = make('Dave', 'a lanky youth', world.getRoomById('yard'));
        movePlayer(world, alice, hall, 'north', 'south');
        assert.equal(last(bob), 'A tall woman (to Bob) leaves to the north.');
        assert.equal(last(dave), 'A tall woman (to Dave) arrives from the south.');
    }

    // NPC ambient lines
    {
        const { world, hall, bob } = setup();
        const keeper = new Npc(
            { id: 'z/k', name: 'a keeper', behaviors: { ambient: { chance: 1, emotes: ['hums.'] } } },
            'hall',
        );
        keeper.alias = 'an old keeper';
        hall.addCharacter(keeper);
        pulseNpc(keeper, world, () => 0, 12);
        assert.equal(last(bob), 'An old keeper (to Bob) hums.');
    }

    // Out of character: tell and who keep real names
    {
        const { world, alice, bob } = setup();
        world.getOnlineCharacterByName = (name) => [alice, bob].find((c) => c.name.toLowerCase() === name);
        assert.equal(tell(world, ['bob', 'hi'], alice), 'You tell Bob: "hi"');
        assert.equal(last(bob), 'Alice tells you: "hi"');
        assert.match(who(world), /Alice/);
    }
} finally {
    resetNamingPolicy();
}

console.log('All tests passed');
