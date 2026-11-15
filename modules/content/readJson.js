// Reading a content or config JSON file (packs' content, games/*.json,
// pack.json), with the file named in the error when it's missing or
// malformed. Save files use atomicWrite.js's readJsonFile instead, which
// treats a missing file as "nothing saved yet".
import fs from 'fs';

/**
 * @param {string} filePath
 * @param {string} [what] - What the file is, for the error ("pack \"x\"'s manifest").
 * @returns {any}
 */
export function readJson(filePath, what) {
    try {
        return JSON.parse(fs.readFileSync(filePath, 'utf8'));
    } catch (err) {
        throw new Error(`Couldn't read ${what ? `${what} (${filePath})` : filePath}: ${err.message}`);
    }
}
