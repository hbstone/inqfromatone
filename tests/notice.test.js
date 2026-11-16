import assert from 'assert/strict';
import { World } from '../modules/World.js';
import { Npc } from '../modules/Npc.js';
import { Item } from '../modules/Item.js';
import { clearNoticeRule, noticesIn, registerNoticeRule, tellRoomNoticing } from '../modules/notice.js';
import { get } from '../modules/commands/get.js';
import { put } from '../modules/commands/put.js';
import { wear } from '../modules/commands/wear.js';
import { remove } from '../modules/commands/remove.js';
import { promptStatusesFor, registerPromptStatus } from '../modules/promptStatus.js';
import { writePrompt } from '../modules/utils.js';
import { makeCharacter, lastMessage } from './helpers.js';

function setUp() {
    const world = new World();
    world.addRoom('Hall', 'A hall.', 'test/house/hall');
    const hall = world.getRoomById('test/house/hall');
    const alice = makeCharacter('Alice');
    const bob = makeCharacter('Bob');
    const sleeper = new Npc({ id: 'test/house/sleeper', name: 'a sleeper', senses: { sight: false } }, hall.id);
    for (const c of [alice, bob, sleeper]) {
        hall.addCharacter(c);
    }
    return { world, hall, alice, bob, sleeper };
}

// With no rule, everyone who can see notices; anyone who can't, doesn't
{
    const { hall, alice, bob, sleeper } = setUp();
    const notices = noticesIn(hall, alice, 'leave');
    assert.equal(notices.get(bob), 'noticed');
    assert.equal(notices.get(sleeper), 'unnoticed');
    assert.equal(notices.has(alice), false, 'not the actor');
}

// A rule is asked once, with only those who can see, and anyone it leaves
// out noticed
{
    const { hall, alice, bob } = setUp();
    const requests = [];
    registerNoticeRule(
        (request) => {
            requests.push(request);
            return new Map();
        },
        { note: 'Shifty.' },
    );
    try {
        assert.throws(() => registerNoticeRule(() => null), /already registered/);
        tellRoomNoticing(hall, alice, 'drop', (viewer) => `Alice drops a thing (to ${viewer.name}).`);
        assert.equal(requests.length, 1);
        assert.deepEqual(requests[0].observers, [bob]);
        assert.equal(requests[0].action, 'drop');
        assert.equal(lastMessage(bob), 'Alice drops a thing (to Bob).');

        registerNoticeRule(() => new Map([[bob, 'suspicious']]), { note: 'Shifty.', override: true });
        tellRoomNoticing(hall, alice, 'drop', () => 'Alice drops a thing.');
        assert.equal(lastMessage(bob), 'Alice drops a thing. Shifty.');
    } finally {
        clearNoticeRule();
    }
}

// The item verbs now tell the room
{
    const { world, hall, alice, bob } = setUp();
    const sack = new Item('a sack', 'A sack.', ['sack'], { container: { maxItemSize: 'small', capacityWeight: 10 } });
    hall.inventory.push(new Item('a dagger', 'A dagger.', ['dagger'], { equip: { slot: 'wield' } }), sack);
    get(world, ['dagger'], alice);
    assert.equal(lastMessage(bob), 'Alice picks up a dagger.');
    wear(world, ['dagger'], alice);
    assert.equal(lastMessage(bob), 'Alice wears a dagger.');
    remove(world, ['dagger'], alice);
    assert.equal(lastMessage(bob), 'Alice removes a dagger.');
    put(world, ['dagger', 'sack'], alice);
    assert.equal(lastMessage(bob), 'Alice puts a dagger in a sack.');
    get(world, ['dagger', 'sack'], alice);
    assert.equal(lastMessage(bob), 'Alice gets a dagger from a sack.');
}

// Prompt statuses, for logged-in players only
{
    const alice = makeCharacter('Alice');
    registerPromptStatus((c) => (c.name === 'Alice' ? 'sneaking' : null));
    registerPromptStatus(() => 'hungry');
    assert.deepEqual(promptStatusesFor(alice), ['sneaking', 'hungry']);
    alice.socket.character = alice;
    writePrompt(alice.socket);
    assert.equal(alice.socket.messages.at(-1), '\r\n> ', 'not logged in yet');
    alice.isLoggedIn = true;
    writePrompt(alice.socket);
    assert.equal(alice.socket.messages.at(-1), '\r\n[sneaking, hungry] > ');
}
