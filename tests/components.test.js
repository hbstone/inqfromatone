import assert from 'assert/strict';
import { Character } from '../modules/Character.js';
import { Room } from '../modules/Room.js';
import { Item } from '../modules/Item.js';

// Each entity gets its own components bag, not shared across instances
const charA = new Character('Alice');
const charB = new Character('Bob');
charA.components.caster = { mana: 50 };
assert.deepStrictEqual(charA.components, { caster: { mana: 50 } });
assert.deepStrictEqual(charB.components, {}, 'components must not leak across Character instances');

const roomA = new Room('Room A', 'First room');
const roomB = new Room('Room B', 'Second room');
roomA.components.weather = { raining: true };
assert.deepStrictEqual(roomB.components, {}, 'components must not leak across Room instances');

const itemA = new Item('Sword', 'A sharp sword', ['sword']);
const itemB = new Item('Shield', 'A sturdy shield', ['shield']);
itemA.components.weapon = { damage: 5 };
assert.deepStrictEqual(itemB.components, {}, 'components must not leak across Item instances');

// setName keeps name/keywords in sync; a fresh Character has neither set
const freshCharacter = new Character();
assert.equal(freshCharacter.name, null);
assert.deepStrictEqual(freshCharacter.keywords, []);
freshCharacter.setName('Old Tom');
assert.equal(freshCharacter.name, 'Old Tom');
assert.deepStrictEqual(freshCharacter.keywords, ['old', 'tom']);

// Room.addCharacter/removeCharacter keep room.characters and
// character.roomId in sync in both directions
const roomWithId = new Room('Room C', 'Third room');
roomWithId.id = 'room-c';
const mover = new Character('Mover');

roomWithId.addCharacter(mover);
assert.equal(mover.roomId, 'room-c');
assert.ok(roomWithId.characters.includes(mover));

roomWithId.removeCharacter(mover);
assert.equal(mover.roomId, null);
assert.ok(!roomWithId.characters.includes(mover));

console.log('All tests passed');
