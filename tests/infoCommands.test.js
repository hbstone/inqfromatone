import assert from 'assert/strict';
import { World } from '../modules/World.js';
import { Character } from '../modules/Character.js';
import { listCommands } from '../modules/commands/registry.js';
import { commands } from '../modules/commands/commands.js';
import { who } from '../modules/commands/who.js';
import '../modules/commands/index.js'; // the real core verbs

// `commands`: every registered verb, alphabetical, full-word-only ones starred
{
    const output = commands();
    const lines = output.split('\n');
    assert.equal(lines[0], 'Available commands:');

    const listed = lines
        .slice(1)
        .filter((line) => line.startsWith('  '))
        .flatMap((line) => line.trim().split(/\s+/));
    const expected = listCommands().map(({ name, abbreviate }) => (abbreviate ? name : `${name}*`));
    assert.deepStrictEqual(listed, expected, 'every command, in alphabetical order');
    assert.deepStrictEqual(
        expected.map((n) => n.replace('*', '')),
        [...expected.map((n) => n.replace('*', ''))].sort(),
    );

    assert.ok(listed.includes('kill*') && listed.includes('quit*'), 'full-word-only commands are starred');
    assert.ok(listed.includes('commands') && listed.includes('who'));
    assert.match(output, /\* must be typed in full/);
}

// `who`: everyone online, alphabetical regardless of case, indented two
// spaces, one per line - and not characters without a connection
{
    const world = new World();
    const a = world.getRoomById(world.addRoom('Room A', 'A room.'));
    const b = world.getRoomById(world.addRoom('Room B', 'Another room.'));

    for (const [name, room] of [
        ['Zed', a],
        ['amy', b],
        ['Bob', a],
    ]) {
        const character = new Character(name);
        character.socket = { write() {} };
        room.addCharacter(character);
    }
    a.addCharacter(new Character('Nosocket')); // not connected

    assert.equal(who(world), 'Currently connected players:\n  amy\n  Bob\n  Zed');
}

console.log('All tests passed');
