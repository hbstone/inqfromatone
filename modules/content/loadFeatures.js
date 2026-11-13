// Optional engine features a game switches on, from content/features.json
// (see ARCHITECTURE.md's "Recognition"). Each is off unless the file says
// otherwise, so a game with no features.json gets plain core behavior.
//
//   { "recognition": true }
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const DEFAULT_FEATURES_FILE = path.join(
    path.dirname(fileURLToPath(import.meta.url)),
    '..',
    '..',
    'content',
    'features.json',
);

const KNOWN = ['recognition'];

/**
 * @param {string} [filePath] - Overridable for tests.
 * @returns {{ recognition: boolean }}
 */
export function loadFeatures(filePath = DEFAULT_FEATURES_FILE) {
    if (!fs.existsSync(filePath)) {
        return { recognition: false };
    }
    const settings = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    for (const key of Object.keys(settings)) {
        if (!KNOWN.includes(key)) {
            console.warn(`Unknown feature "${key}" in features.json; ignoring it.`);
        }
    }
    return { recognition: settings.recognition === true };
}
