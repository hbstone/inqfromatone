import assert from 'assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';
import {
    loadStatDefinitions,
    getStatDefinitions,
    getStatDefinition,
    getStatKeyForRole,
    initializeCharacterStats,
} from '../modules/content/loadStatDefinitions.js';
import { getStatValue } from '../modules/stats.js';

function withFixtureDir(attributesData, fn) {
    const fixtureDir = fs.mkdtempSync(path.join(os.tmpdir(), 'stat-definitions-'));
    fs.writeFileSync(path.join(fixtureDir, 'attributes.json'), JSON.stringify(attributesData));
    try {
        return fn(fixtureDir);
    } finally {
        fs.rmSync(fixtureDir, { recursive: true, force: true });
    }
}

// Loading the real shipped content/stats/attributes.json should produce
// the sextet plus hp, with hp carrying the vitality role. Doubles as a
// regression check that the shipped content stays valid.
{
    loadStatDefinitions();

    const keys = getStatDefinitions().map(def => def.key).sort();
    assert.deepStrictEqual(keys, [
        'charisma', 'constitution', 'dexterity', 'hp', 'intelligence', 'strength', 'wisdom',
    ]);

    assert.equal(getStatKeyForRole('vitality'), 'hp');
    assert.equal(getStatDefinition('hp').startingValue, 10);
    assert.equal(getStatDefinition('strength').label, 'Strength');
}

// initializeCharacterStats seeds every defined stat at its starting value
{
    loadStatDefinitions();
    const character = { components: {} };
    initializeCharacterStats(character);

    for (const def of getStatDefinitions()) {
        assert.equal(getStatValue(character, def.key), def.startingValue);
    }
}

// Two stats claiming the same role is a data error - fails loudly rather
// than silently picking one
{
    assert.throws(
        () => withFixtureDir(
            [
                { key: 'hp', label: 'Hit Points', startingValue: 10, role: 'vitality' },
                { key: 'sanity', label: 'Sanity', startingValue: 10, role: 'vitality' },
            ],
            (dir) => loadStatDefinitions(dir)
        ),
        /Duplicate role "vitality"/
    );
}

// Duplicate stat keys are caught the same way rooms/items already are
// (shared assertUniqueKeys helper)
{
    assert.throws(
        () => withFixtureDir(
            [
                { key: 'strength', label: 'Strength', startingValue: 10 },
                { key: 'strength', label: 'Also Strength', startingValue: 12 },
            ],
            (dir) => loadStatDefinitions(dir)
        ),
        /Duplicate stat key "strength"/
    );
}

// Reloading replaces previously loaded definitions rather than merging
// with them
{
    withFixtureDir(
        [{ key: 'onlyThis', label: 'Only This', startingValue: 1 }],
        (dir) => loadStatDefinitions(dir)
    );
    assert.deepStrictEqual(getStatDefinitions().map(def => def.key), ['onlyThis']);
    assert.equal(getStatKeyForRole('vitality'), undefined, 'stale role from a previous load should be cleared');
}

console.log('All tests passed');
