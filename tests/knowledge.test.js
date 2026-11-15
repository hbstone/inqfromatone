import assert from 'assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { World } from '../modules/World.js';
import { Character } from '../modules/Character.js';
import { Npc } from '../modules/Npc.js';
import { ask } from '../modules/commands/ask.js';
import { movePlayer } from '../modules/commands/move.js';
import { emit } from '../modules/events.js';
import { enableRecognition } from '../modules/recognition/index.js';
import {
    loadNpcKnowledge,
    noticeArrival,
    noticeDeparture,
    recallSighting,
    saveNpcKnowledge,
    sightingAnswer,
    watchForSightings,
    SIGHTING_MEMORY_MINUTES,
} from '../modules/npcs/knowledge.js';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'knowledge-'));
enableRecognition({ charactersDir: path.join(tmp, 'characters') }); // NPCs see strangers by short description
watchForSightings();

function makeCharacter(name, shortDesc) {
    const character = new Character(name, `${name}, a tester.`);
    character.shortDesc = shortDesc;
    character.socket = { written: [] };
    character.socket.write = (msg) => character.socket.written.push(msg);
    return character;
}

const BARTENDER = {
    id: 'test/town/bartender',
    name: 'a mustachioed bartender',
    keywords: ['bartender'],
    sightings: true,
    topics: [{ keywords: ['whiskey'], says: 'Only whiskey in town.' }],
};

// saloon (north) <-> street (south)
function setUp() {
    const world = new World();
    world.addRoom('Saloon', 'A saloon.', 'test/town/saloon');
    world.addRoom('Street', 'A street.', 'test/town/street');
    const saloon = world.getRoomById('test/town/saloon');
    const street = world.getRoomById('test/town/street');
    saloon.exits = { south: 'test/town/street' };
    street.exits = { north: 'test/town/saloon' };
    const bartender = new Npc(BARTENDER, saloon.id);
    const dog = new Npc({ id: 'test/town/dog', name: 'a yellow dog', keywords: ['dog'] }, saloon.id);
    world.npcs.push(bartender, dog);
    saloon.addCharacter(bartender);
    saloon.addCharacter(dog);
    const alice = makeCharacter('Alice', 'a bearded man');
    const baeron = makeCharacter('Baeron', 'a tall woman');
    street.addCharacter(alice);
    saloon.addCharacter(baeron);
    return { world, saloon, street, bartender, dog, alice, baeron };
}

const reply = (result) => result.split('\n').slice(1).join('\n');

// Walking in and out is noticed, with directions, by NPCs that notice
// people; the asker names them by how they look
{
    const { world, saloon, street, bartender, dog, alice, baeron } = setUp();
    movePlayer(world, alice, street, 'north', 'south');
    assert.equal(bartender.knowledge.sightings['pc:alice'].seenAs, 'a bearded man');
    assert.equal(bartender.knowledge.sightings['pc:alice'].arrivedFrom, 'south');
    assert.equal(bartender.knowledgeDirty, true);
    assert.deepEqual(dog.knowledge.sightings, {}, 'the dog has no "sightings"');

    assert.equal(
        reply(ask(world, ['bartender', 'about', 'the', 'bearded', 'man'], baeron)),
        'A mustachioed bartender nods across the room.\nA mustachioed bartender says, "A bearded man? Right there."',
    );

    movePlayer(world, alice, saloon, 'south', 'north');
    assert.equal(
        reply(ask(world, ['bartender', 'about', 'the', 'bearded', 'man?'], baeron)),
        'A mustachioed bartender says, "A bearded man? Came in from the south just now, headed south."',
    );
    assert.match(reply(ask(world, ['bartender', 'about', 'bearded'], baeron)), /A bearded man\?/, 'one word will do');
    assert.match(
        reply(ask(world, ['bartender', 'about', 'the', 'bearded', 'woman'], baeron)),
        /doesn't seem to know anything about that/,
        'every word has to fit',
    );
}

// A name the asker gave them with `remember` works too
{
    const { world, street, bartender, alice, baeron } = setUp();
    movePlayer(world, alice, street, 'north', 'south');
    baeron.memories = { alice: { name: 'Ally', knewAs: 'a bearded man', notes: [] } };
    assert.match(reply(ask(world, ['bartender', 'about', 'ally'], baeron)), /A bearded man\? Right there/);
    assert.equal(recallSighting(bartender, 'ally', null), null, "someone who hasn't named her can't use the name");
}

// Leaving the game: gone, no direction
{
    const { world, saloon, street, alice, baeron } = setUp();
    movePlayer(world, alice, street, 'north', 'south');
    emit('characterLeaving', { character: alice, room: saloon, world });
    saloon.removeCharacter(alice);
    assert.match(reply(ask(world, ['bartender', 'about', 'bearded', 'man'], baeron)), /Haven't seen them since\./);
}

// An NPC walking in notices who's already there; walking out, it last saw
// them there
{
    const { world, saloon, street, bartender } = setUp();
    movePlayer(world, bartender, saloon, 'south', 'north');
    const seen = bartender.knowledge.sightings['pc:alice'];
    assert.equal(seen.gone, false);
    assert.equal(seen.arrivedFrom, null);
    movePlayer(world, bartender, street, 'north', 'south');
    assert.match(
        sightingAnswer(recallSighting(bartender, 'bearded man'), saloon).says,
        /^A bearded man\? Saw them just now\.$/,
    );
}

// How long ago, and forgetting after a game day
{
    const { saloon, street, bartender, alice } = setUp();
    const day2 = 2 * 24 * 60; // midnight starting a day
    noticeArrival({ character: alice, room: saloon, from: 'south' }, day2 + 6 * 60);
    noticeDeparture({ character: alice, room: saloon, direction: 'west' }, day2 + 6 * 60);
    street.addCharacter(alice);
    const at = (minutesLater) => {
        const sighting = recallSighting(bartender, 'bearded man', null, day2 + 6 * 60 + minutesLater);
        return sighting && sightingAnswer(sighting, saloon, day2 + 6 * 60 + minutesLater).says;
    };
    assert.equal(at(30), 'A bearded man? Came in from the south just now, headed west.');
    assert.match(at(120), /a little while ago/);
    assert.match(at(10 * 60), /earlier today/);
    assert.match(at(20 * 60), /yesterday/);
    assert.equal(at(SIGHTING_MEMORY_MINUTES + 1), null, 'forgotten after a game day');
    assert.deepEqual(bartender.knowledge.sightings, {});
}

// A topic that is the whole question beats a person; a person whose
// description merely contains a topic word is asked about as a person
{
    const { world, saloon, street, alice, baeron } = setUp();
    alice.shortDesc = 'a whiskey-soaked drifter';
    movePlayer(world, alice, street, 'north', 'south');
    movePlayer(world, alice, saloon, 'south', 'north');
    assert.match(reply(ask(world, ['bartender', 'about', 'whiskey'], baeron)), /Only whiskey in town/);
    assert.match(
        reply(ask(world, ['bartender', 'about', 'the', 'whiskey-soaked', 'drifter'], baeron)),
        /A whiskey-soaked drifter\? Came in from the south/,
    );
}

// Saved with the world checkpoint, only when changed, and loaded back,
// minus anything too old to remember
{
    const dir = path.join(tmp, 'npcs');
    const { saloon, bartender, alice } = setUp();
    noticeArrival({ character: alice, room: saloon, from: 'south' }, 1000);
    saveNpcKnowledge({ npcs: [bartender] }, dir, 1000);
    const file = path.join(dir, 'test', 'town', 'bartender.json');
    assert.equal(JSON.parse(fs.readFileSync(file, 'utf8')).sightings['pc:alice'].seenAs, 'a bearded man');
    assert.equal(bartender.knowledgeDirty, false);
    assert.equal(
        fs.existsSync(path.join(dir, 'test', 'town', 'dog.json')),
        false,
        "the dog doesn't notice, so no file",
    );

    fs.rmSync(file);
    saveNpcKnowledge({ npcs: [bartender] }, dir, 1001);
    assert.equal(fs.existsSync(file), false, 'nothing changed, nothing written');

    noticeArrival({ character: alice, room: saloon, from: 'north' }, 1002);
    saveNpcKnowledge({ npcs: [bartender] }, dir, 1002);
    const fresh = new Npc(BARTENDER, saloon.id);
    loadNpcKnowledge({ npcs: [fresh] }, dir, 1100);
    assert.equal(fresh.knowledge.sightings['pc:alice'].arrivedFrom, 'north');
    const later = new Npc(BARTENDER, saloon.id);
    loadNpcKnowledge({ npcs: [later] }, dir, 1002 + SIGHTING_MEMORY_MINUTES + 1);
    assert.deepEqual(later.knowledge.sightings, {}, 'too old by the time it loads');
}

fs.rmSync(tmp, { recursive: true, force: true });
console.log('All tests passed');
