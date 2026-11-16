import assert from 'assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';
import '../modules/commands/index.js'; // core verbs, as in a game
import { World } from '../modules/World.js';
import { listCommands } from '../modules/commands/registry.js';
import { readGame, contentDirsOf, setUpPackCode } from '../modules/packs/game.js';
import { enableRecognition } from '../modules/recognition/index.js';
import { commandsWithoutHelp, findHelp, helpTopics, loadHelp, parseHelp } from '../modules/content/loadHelp.js';
import { help } from '../modules/commands/help.js';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'help-'));

// Every verb a game can have has a help topic: core's (with recognition on)
// and every pack's. The western game has every code pack in it.
{
    enableRecognition({ charactersDir: path.join(tmp, 'characters') });
    const game = readGame('western', {});
    await setUpPackCode(game, new World());
    loadHelp(contentDirsOf(game));
    assert.deepEqual(
        commandsWithoutHelp(listCommands().map((c) => c.name)),
        [],
        'add a topic to help/ (core) or the pack\'s content/help/, listing the verb under "commands:"',
    );
    // and every "see also" names a topic that exists
    const names = new Set(helpTopics().flatMap((topic) => topic.keywords));
    for (const topic of helpTopics()) {
        for (const other of topic.seeAlso) {
            assert.ok(names.has(other), `${topic.name}: "see also" names "${other}", which no topic answers to`);
        }
    }
}

// Reading: a topic by keyword, by a command it covers, or by the start of a
// word; see also at the end; ambiguity and misses said so
{
    assert.match(help(null, ['sneak']), /^Help: sneak\n\nsneak\nsneak on\|off\nTry to go unnoticed/);
    assert.match(help(null, ['forget']), /Strangers are known by how they look/, 'a command the topic covers');
    assert.match(help(null, ['abbrev']), /shortened to their first letters/);
    assert.match(help(null, ['look']), /See also: items, presence$/);
    assert.match(help(null, ['re']), /^"re" could mean: /);
    assert.equal(help(null, ['xyzzy']), 'There\'s no help on "xyzzy". Type help for a list of topics.');
    assert.match(help(null, []), /^Help topics:\n {2}abbreviations/);
}

// Packs replace topics by file name, later packs winning; a topic for verbs
// this game doesn't have isn't listed
{
    const core = path.join(tmp, 'core');
    const pack = path.join(tmp, 'pack');
    fs.mkdirSync(core, { recursive: true });
    fs.mkdirSync(path.join(pack, 'help'), { recursive: true });
    fs.writeFileSync(path.join(core, 'say.txt'), 'keywords: say\ncommands: say\n\nSpeak.\n');
    fs.writeFileSync(path.join(core, 'fly.txt'), 'commands: fly\n\nYou wish.\n');
    fs.writeFileSync(path.join(pack, 'help', 'say.txt'), 'keywords: say, holler\ncommands: say\n\nHoller, partner.\n');
    loadHelp([pack], core);
    assert.equal(findHelp('say')[0].text, 'Holler, partner.');
    assert.equal(findHelp('holler').length, 1);
    assert.deepEqual(findHelp('fly'), [], 'no fly command here');
    assert.deepEqual(
        helpTopics().map((t) => t.name),
        ['say'],
    );
}

// Help files are checked when loaded
{
    assert.throws(() => parseHelp('keywords: x\nText with no blank line', 'f.txt'), /f\.txt: needs header lines/);
    assert.throws(() => parseHelp('topic: x\n\nText.', 'f.txt'), /unknown header line "topic: x"/);
    assert.throws(() => parseHelp('see also: x\n\nText.', 'f.txt'), /needs a "keywords"/);
    assert.throws(() => parseHelp('keywords: x\n\n  \n', 'f.txt'), /has no text/);
    assert.deepEqual(parseHelp('Keywords: A, b\r\ncommands: c\r\n\r\nText.\r\n', 'f.txt'), {
        keywords: ['a', 'b', 'c'],
        commands: ['c'],
        seeAlso: [],
        text: 'Text.',
    });
}

fs.rmSync(tmp, { recursive: true, force: true });
