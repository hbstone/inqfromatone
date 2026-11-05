import assert from 'assert/strict';
import { resolveCommand, getCommand, registerCommand, explainCommand } from '../modules/commands/registry.js';
import '../modules/commands/index.js'; // the real core verbs, in their real priority order

const resolve = (typed) => resolveCommand(typed)?.name;

// Exact names, any case
{
    assert.equal(resolve('look'), 'look');
    assert.equal(resolve('LOOK'), 'look');
    assert.equal(resolve('Look'), 'look');
}

// Abbreviations land on the expected verbs, per registration priority
{
    const expected = {
        n: 'north', s: 'south', e: 'east', w: 'west',
        l: 'look', g: 'get', d: 'drop', i: 'items',
        gi: 'give', p: 'put', r: 'remove',
        we: 'west', wea: 'wear', wi: 'wield', wh: 'whisper',
        sa: 'say', sc: 'score', t: 'tell', em: 'emote',
        f: 'flee', di: 'disengage', c: 'color',
        N: 'north', SOU: 'south',
    };
    for (const [typed, name] of Object.entries(expected)) {
        assert.equal(resolve(typed), name, `"${typed}" should resolve to ${name}`);
    }
}

// quit and kill require the full word
{
    assert.equal(resolve('k'), undefined);
    assert.equal(resolve('kil'), undefined);
    assert.equal(resolve('kill'), 'kill');
    assert.equal(resolve('q'), undefined);
    assert.equal(resolve('qui'), undefined);
    assert.equal(resolve('quit'), 'quit');
    assert.equal(resolve('QUIT'), 'quit');
}

// Unknown, empty, and over-long input resolve to nothing
{
    assert.equal(resolve('xyzzy'), undefined);
    assert.equal(resolve(''), undefined);
    assert.equal(resolve('looking'), undefined, 'a longer word is not an abbreviation');
    assert.equal(getCommand('xyzzy'), undefined);
}

// A later-registered (pack) verb can't take over a core abbreviation, but
// is reachable by its own unambiguous prefix and its full name; an exact
// name beats an earlier command it happens to prefix
{
    const noop = () => 'pack';
    registerCommand('nod', noop);
    assert.equal(resolve('n'), 'north', 'core keeps n');
    assert.equal(resolve('no'), 'north', 'still north - registered first');
    assert.equal(resolve('nod'), 'nod');

    registerCommand('lo', noop);
    assert.equal(resolve('lo'), 'lo', 'an exact match beats look, registered earlier');
    assert.equal(resolve('l'), 'look', 'look keeps the shorter prefix');

    // A full-word-only core verb doesn't block a pack verb's prefix
    registerCommand('kick', noop);
    assert.equal(resolve('k'), 'kick', 'kill needs its full name, so k falls through to kick');
    assert.equal(resolve('kill'), 'kill');
}

// explainCommand: what a typed verb would run, echoing what was typed
{
    assert.equal(explainCommand('n'), '"n" is north.');
    assert.equal(explainCommand('N'), '"N" is north.');
    assert.equal(explainCommand('look'), '"look" is look.');
    assert.equal(explainCommand('xyzzy'), `"xyzzy" doesn't match any command.`);
    assert.equal(explainCommand('q'), `"q" doesn't match any command. (quit must be typed in full.)`);
    assert.equal(explainCommand('kil'), `"kil" doesn't match any command. (kill must be typed in full.)`);
    assert.match(explainCommand(''), /followed by \? to see/);
}

// Duplicate names are rejected case-insensitively
{
    assert.throws(() => registerCommand('LOOK', () => {}), /already registered/);
}

console.log('All tests passed');
