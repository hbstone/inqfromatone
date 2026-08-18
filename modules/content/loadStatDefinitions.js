// Loads stat *definitions* (which stats exist, their starting values, and
// any core-recognized role) out of content/stats/, and provides the one
// place that knows what stats a character should have (see
// ARCHITECTURE.md's Phase 2 notes on the stats mechanism/identity split).
//
// content/stats/ is its own subdirectory, not flat inside content/,
// specifically so a later content/stats/humors.json (the fantasy-specific
// elemental mapping) sits next to attributes.json (generic, reusable) as
// an obviously separate concern - without building any real pack
// composition machinery now; there's no second pack yet to design that
// against (that's Phase 4's job).
//
// Like modules/commands/registry.js, definitions live in module-level
// state once loaded, queried via exported functions, rather than being
// threaded through every call site that needs them.
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { assertUniqueKeys } from "./assertUniqueKeys.js";
import { initStat } from "../stats.js";

const DEFAULT_CONTENT_DIR = path.join(
    path.dirname(fileURLToPath(import.meta.url)),
    "..", "..", "content", "stats"
);

function readJson(filePath) {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

const definitions = new Map(); // key -> { key, label, startingValue, role? }
const roleIndex = {}; // role -> key

/**
 * Load stat definitions into module-level state, replacing whatever was
 * previously loaded.
 * @param {string} [contentDir] - Directory containing attributes.json.
 *   Defaults to the repo's top-level content/stats/ directory. Overridable
 *   so tests can point at fixture data.
 */
export function loadStatDefinitions(contentDir = DEFAULT_CONTENT_DIR) {
    const attributes = readJson(path.join(contentDir, "attributes.json"));
    assertUniqueKeys(attributes, "stat");

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
                    `Duplicate role "${def.role}" in content data: both "${roleIndex[def.role]}" and "${def.key}" claim it.`
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
