// Loads stat *definitions* (which stats exist, their starting values, and
// any core-recognized role) out of each pack's content/stats/*.json, merged
// across packs (see mergeByKey.js), and provides the one
// place that knows what stats a character should have (see
// ARCHITECTURE.md's Phase 2 notes on the stats mechanism/identity split).
//
// A pack's stats/ is its own subdirectory, not flat inside content/,
// specifically so a later stats/humors.json (the fantasy-specific
// elemental mapping) sits next to attributes.json (generic, reusable) as
// an obviously separate concern - without building any real pack
// composition machinery now; there's no second pack yet to design that
// against (that's Phase 4's job).
//
// Like modules/commands/registry.js, definitions live in module-level
// state once loaded, queried via exported functions, rather than being
// threaded through every call site that needs them.
import fs from 'fs';
import path from 'path';
import { mergeByKey, sourceName } from './mergeByKey.js';
import { defaultContentDirs } from '../packs/game.js';
import { initStat } from '../stats.js';

function readJson(filePath) {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

const definitions = new Map(); // key -> { key, label, startingValue, role? }
const roleIndex = {}; // role -> key

/**
 * Load stat definitions into module-level state, replacing whatever was
 * previously loaded.
 * @param {string|string[]} [statsDirs] - stats/ directories (every .json
 *   file in each is read), one per pack in game order; a single path works
 *   too. Defaults to the default game's packs (see modules/packs/game.js).
 */
export function loadStatDefinitions(statsDirs = defaultContentDirs().map((dir) => path.join(dir, 'stats'))) {
    const sources = [];
    for (const dir of [statsDirs].flat()) {
        if (!fs.existsSync(dir)) continue;
        for (const file of fs
            .readdirSync(dir)
            .filter((f) => f.endsWith('.json'))
            .sort()) {
            sources.push({ source: `${sourceName(dir, path)}/${file}`, entries: readJson(path.join(dir, file)) });
        }
    }
    const attributes = mergeByKey(sources, 'stat');

    definitions.clear();
    for (const key of Object.keys(roleIndex)) {
        delete roleIndex[key];
    }

    for (const def of attributes) {
        definitions.set(def.key, def);

        if (def.role) {
            // Two stats claiming the same role is a data error, same
            // treatment as a duplicate key - fail loudly rather than
            // leave combat (or whatever reads the role later) to
            // arbitrarily pick one.
            if (roleIndex[def.role]) {
                throw new Error(
                    `Duplicate role "${def.role}" in content data: both "${roleIndex[def.role]}" and "${def.key}" claim it.`,
                );
            }
            roleIndex[def.role] = def.key;
        }
    }
}

/** @returns {object[]} All loaded stat definitions. */
export function getStatDefinitions() {
    return Array.from(definitions.values());
}

/**
 * @param {string} key
 * @returns {object|undefined}
 */
export function getStatDefinition(key) {
    return definitions.get(key);
}

/**
 * Look up which stat key carries a given core-recognized role (e.g.
 * "vitality"). Core only ever looks up roles by this open string - it
 * never hardcodes a stat name.
 * @param {string} role
 * @returns {string|undefined}
 */
export function getStatKeyForRole(role) {
    return roleIndex[role];
}

/**
 * Seed a brand-new character's stats from the loaded definitions'
 * starting values. Returning characters get their stats back through
 * Character.restoreFrom's normal components round-trip instead - this is
 * only for character creation.
 * @param {object} character
 */
export function initializeCharacterStats(character) {
    for (const def of definitions.values()) {
        initStat(character, def.key, def.startingValue);
    }
}
