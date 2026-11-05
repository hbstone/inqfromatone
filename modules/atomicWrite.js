// Shared by the storage adapters (data.js, worldData.js). Writing straight
// over a save file means a crash or kill mid-write leaves truncated,
// unparseable JSON behind - for a character file, that's an account nobody
// can log into anymore. Writing a sibling temp file and renaming it over
// the real one means a reader only ever sees the old complete file or the
// new complete file: rename replaces the target in one step on both POSIX
// and Windows (Node uses MoveFileEx with REPLACE_EXISTING there).
import fs from "fs";
import path from "path";

/**
 * Serialize `data` as pretty-printed JSON and atomically replace filePath
 * with it, creating the parent directory if needed.
 * @param {string} filePath
 * @param {unknown} data
 */
export function writeJsonAtomic(filePath, data) {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    const tempPath = `${filePath}.tmp`;
    fs.writeFileSync(tempPath, JSON.stringify(data, null, 2));
    fs.renameSync(tempPath, filePath);
}

/**
 * Read and parse a JSON save file.
 * @param {string} filePath
 * @returns {object|null} The parsed record, or null if the file doesn't
 *   exist. A file that exists but won't parse is logged and also returns
 *   null - callers that need to tell "missing" from "corrupt" apart check
 *   existence separately (see game.js's login and saveCharacter in
 *   modules/worldPersistence.js).
 */
export function readJsonFile(filePath) {
    let raw;
    try {
        raw = fs.readFileSync(filePath, "utf8");
    } catch (err) {
        if (err.code === "ENOENT") {
            return null;
        }
        throw err;
    }

    try {
        return JSON.parse(raw);
    } catch (err) {
        console.error(`Save file ${filePath} is not valid JSON:`, err.message);
        return null;
    }
}
