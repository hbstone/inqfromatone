import assert from 'assert/strict';
import { World } from '../modules/World.js';
import { Character } from '../modules/Character.js';
import { Item } from '../modules/Item.js';
import { emote } from '../modules/commands/emote.js';

function makeCharacter(name) {
    const character = new Character(name, `${name}, a tester.`);
    character.socket = { written: [] };
    character.socket.write = msg => character.socket.written.push(msg);
    return character;
}

function lastMessage(character) {
    // writeToSocket appends a trailing CRLF - strip it for comparison.
    return character.socket.written[character.socket.written.length - 1].replace(/\r\n$/, '');
}

function setUpRoom() {
    const world = new World();
    const room = world.getRoomById(world.addRoom('Room', 'A room.'));
    const alice = makeCharacter('Alice');
    const baeron = makeCharacter('Baeron');
    room.addCharacter(alice);
    room.addCharacter(baeron);
    return { world, room, alice, baeron };
}

// Basic broadcast: actor gets "You <text>.", bystanders get "Name <text>."
{
    const { world, alice, baeron } = setUpRoom();
    const result = emote(world, ['shrugs'], alice);
    assert.equal(result, 'You shrugs.');
    assert.equal(lastMessage(baeron), 'Alice shrugs.');
}

// Trailing period only added when the text ends in a letter or number -
// same rule as say, but the text itself is never capitalized (it's glued
// onto the character's name, not standing alone)
{
    const { world, alice } = setUpRoom();
    assert.equal(emote(world, ['grins?'], alice), 'You grins?');
    assert.equal(emote(world, ['counts', 'to', '5'], alice), 'You counts to 5.');
    assert.equal(emote(world, ['is', 'not', 'shouting'], alice), 'You is not shouting.', 'no forced capitalization');
}

// @keyword resolves to a character's real name, searched in the room
{
    const { world, alice, baeron } = setUpRoom();
    const result = emote(world, ['waves', 'at', '@baeron'], alice);
    assert.equal(result, 'You waves at Baeron.');
    assert.equal(lastMessage(baeron), 'Alice waves at Baeron.');
}

// #keyword resolves to an item's real name, searched in the actor's
// inventory first, then the room floor
{
    const { world, alice } = setUpRoom();
    const heldBrick = new Item('a 1 lb brick', 'A brick.', ['brick', 'one'], { size: 'small', weight: 1 });
    alice.inventory.push(heldBrick);

    assert.equal(emote(world, ['hefts', '#brick'], alice), 'You hefts a 1 lb brick.');
}

{
    const { world, room, alice } = setUpRoom();
    const floorKey = new Item('a rusty key', 'A key.', ['rusty', 'key']);
    room.inventory.push(floorKey);

    assert.equal(emote(world, ['points', 'at', '#key'], alice), 'You points at a rusty key.');
}

// Unresolved targets fall back to "someone"/"something" rather than
// failing the whole emote
{
    const { world, alice } = setUpRoom();
    const result = emote(world, ['waves', '#nothing', 'at', '@nobody'], alice);
    assert.equal(result, 'You waves something at someone.');
}

// Trailing punctuation on a target token is preserved after substitution
{
    const { world, alice } = setUpRoom();
    assert.equal(emote(world, ['looks', 'at', '@baeron,', 'sighing'], alice), 'You looks at Baeron, sighing.');
}

// A lone "@"/"#" with nothing after isn't treated as a target token
{
    const { world, alice } = setUpRoom();
    assert.equal(emote(world, ['mutters', '@', '#'], alice), 'You mutters @ #', 'ends in "#", so no period is added either');
}

// No args at all is rejected, not sent as an empty emote
{
    const { world, alice } = setUpRoom();
    assert.equal(emote(world, [], alice), 'Emote what?');
}

// #2.pouch resolves the ordinal by real name
{
    const { world, room, alice } = setUpRoom();
    room.inventory.push(
        new Item('a red pouch', 'A pouch.', ['pouch'], { size: 'small', weight: 0.5, container: { maxItemSize: 'small', capacityWeight: 5 } }),
        new Item('a blue pouch', 'A pouch.', ['pouch'], { size: 'small', weight: 0.5, container: { maxItemSize: 'small', capacityWeight: 5 } }),
    );

    assert.equal(emote(world, ['tucks', 'a', 'hand', 'into', '#2.pouch'], alice), 'You tucks a hand into a blue pouch.');
}

// #3*brick resolves the cardinal as a grouped "xN" list, same as get/put
{
    const { world, room, alice } = setUpRoom();
    room.inventory.push(
        new Item('a 0.5 lb brick', 'A brick.', ['brick'], { size: 'small', weight: 0.5 }),
        new Item('a 0.5 lb brick', 'A brick.', ['brick'], { size: 'small', weight: 0.5 }),
        new Item('a 0.5 lb brick', 'A brick.', ['brick'], { size: 'small', weight: 0.5 }),
    );

    assert.equal(emote(world, ['juggles', '#3*brick'], alice), 'You juggles a 0.5 lb brick (x3)', 'ends in ")", so no period is added');
}

// A qualified # asking for more than exists fails the *whole* emote -
// nothing broadcasts, the actor gets the "there aren't N..." message,
// unlike the unqualified soft-fallback case above
{
    const { world, room, alice, baeron } = setUpRoom();
    room.inventory.push(new Item('a pouch', 'A pouch.', ['pouch'], { size: 'small', weight: 0.5, container: { maxItemSize: 'small', capacityWeight: 5 } }));
    const before = baeron.socket.written.length;

    const result = emote(world, ['tucks', 'a', 'hand', 'into', '#2.pouch'], alice);

    assert.equal(result, 'There aren\'t 2 things matching "pouch" here.');
    assert.equal(baeron.socket.written.length, before, 'nothing should have been broadcast to the room');
}

// Same failure with zero matches at all, and with a cardinal qualifier
{
    const { world, alice } = setUpRoom();
    assert.equal(emote(world, ['looks', 'for', '#2.pouch'], alice), 'There aren\'t 2 things matching "pouch" here.');
    assert.equal(emote(world, ['gathers', '#3*brick'], alice), 'There aren\'t 3 things matching "brick" here.');
}

// @/# matching is fuzzy (substring) - "@bae" finds Baeron, "#bri" finds
// a brick
{
    const { world, room, alice } = setUpRoom();
    room.inventory.push(new Item('a 0.5 lb brick', 'A brick.', ['brick', 'half'], { size: 'small', weight: 0.5 }));

    assert.equal(emote(world, ['waves', 'at', '@bae'], alice), 'You waves at Baeron.');
    assert.equal(emote(world, ['hefts', '#bri'], alice), 'You hefts a 0.5 lb brick.');
}

console.log('All tests passed');
