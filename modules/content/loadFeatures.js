// Optional engine features a game switches on, from its packs'
// features.json files, merged in game order with later packs winning (see
// ARCHITECTURE.md's "Recognition" and "Packs"). Each is off unless a pack
// says otherwise, so packs without a features.json get plain core behavior.
//
//   { "recognition": true }
import fs from 'fs';
import path from 'path';
import { defaultContentDirs } from '../packs/game.js';
import { sourceName } from './mergeByKey.js';
import { readJson } from './readJson.js';

const KNOWN = ['recognition'];

/**
 * @param {string|string[]} [source] - A features.json path (tests), or
 *   content directories in game order. Defaults to the default game's packs.
 * @returns {{ recognition: boolean }}
 */
export function loadFeatures(source = defaultContentDirs()) {
    const files = Array.isArray(source) ? source.map((dir) => path.join(dir, 'features.json')) : [source];
    const merged = {};
    const setBy = {}; // feature -> the pack that set it
    for (const file of files.filter((f) => fs.existsSync(f))) {
        const settings = readJson(file);
        const pack = sourceName(path.dirname(file), path);
        for (const [key, value] of Object.entries(settings)) {
            if (!KNOWN.includes(key)) {
                console.warn(`Unknown feature "${key}" in ${file}; ignoring it.`);
            } else if (key in merged && merged[key] !== value) {
                // Later packs win, but say so: the earlier pack's author
                // may be counting on their setting.
                console.log(
                    `Feature "${key}": pack "${pack}" sets it to ${value}, replacing "${setBy[key]}"'s ${merged[key]}.`,
                );
            }
            setBy[key] = pack;
        }
        Object.assign(merged, settings);
    }
    return { recognition: merged.recognition === true };
}
