// Games and packs (see ARCHITECTURE.md's "Packs").
//
// A game is an ordered list of packs, in games/<name>.json:
//
//   { "packs": ["starter", "combat"], "startingRoom": "start/starting-room" }
//
// Each pack is a folder under packs/ with a pack.json manifest, and
// optionally content/ (zones, items, stats, time.json, features.json) and
// an index.js whose default export sets the pack up through a context
// object (see context.js). Later packs build on earlier ones: they add
// content and verbs, and replace existing ones only when they say so
// explicitly (`"override": true` / `{ override: true }`).
//
// Which game runs: the GAME environment variable, else "default".
import fs from 'fs';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { createPackContext } from './context.js';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
export const GAMES_DIR = path.join(ROOT, 'games');
export const PACKS_DIR = path.join(ROOT, 'packs');

const NAME_PATTERN = /^[a-z0-9][a-z0-9-]*$/;

function readJson(filePath, what) {
    try {
        return JSON.parse(fs.readFileSync(filePath, 'utf8'));
    } catch (err) {
        throw new Error(`Couldn't read ${what} (${filePath}): ${err.message}`);
    }
}

/**
 * Read a game's config and its packs' manifests.
 * @param {string} [name] - Defaults to $GAME, else "default".
 * @param {{ gamesDir?: string, packsDir?: string }} [dirs] - For tests.
 * @returns {{ name: string, startingRoom: string|null, packs: {
 *   name: string, dir: string, manifest: object, contentDir: string|null,
 *   codeFile: string|null }[] }}
 */
export function readGame(name = process.env.GAME || 'default', { gamesDir = GAMES_DIR, packsDir = PACKS_DIR } = {}) {
    if (!NAME_PATTERN.test(name)) {
        throw new Error(`Invalid game name "${name}": use lowercase letters, digits, and dashes.`);
    }
    const config = readJson(path.join(gamesDir, `${name}.json`), `game "${name}"`);
    if (!Array.isArray(config.packs) || config.packs.length === 0) {
        throw new Error(`Game "${name}" needs a non-empty "packs" list.`);
    }

    const seen = new Set();
    const packs = config.packs.map((packName) => {
        if (typeof packName !== 'string' || !NAME_PATTERN.test(packName)) {
            throw new Error(`Game "${name}" lists an invalid pack name ${JSON.stringify(packName)}.`);
        }
        if (seen.has(packName)) {
            throw new Error(`Game "${name}" lists pack "${packName}" twice.`);
        }
        seen.add(packName);

        const dir = path.join(packsDir, packName);
        const manifest = readJson(path.join(dir, 'pack.json'), `pack "${packName}"'s manifest`);
        if (manifest.name !== packName) {
            throw new Error(`Pack folder "${packName}" has a manifest named "${manifest.name}"; they must match.`);
        }
        const contentDir = path.join(dir, 'content');
        const codeFile = path.join(dir, 'index.js');
        return {
            name: packName,
            dir,
            manifest,
            contentDir: fs.existsSync(contentDir) ? contentDir : null,
            codeFile: fs.existsSync(codeFile) ? codeFile : null,
        };
    });

    return { name, startingRoom: config.startingRoom ?? null, packs };
}

/**
 * The content directories of a game's packs, in load order.
 * @param {ReturnType<typeof readGame>} game
 * @returns {string[]}
 */
export function contentDirsOf(game) {
    return game.packs.map((pack) => pack.contentDir).filter(Boolean);
}

/**
 * The default game's content directories - what the content loaders read
 * when not told otherwise (tests, tools).
 * @returns {string[]}
 */
export function defaultContentDirs() {
    return contentDirsOf(readGame('default'));
}

/**
 * Run each pack's code (its index.js default export), in game order, so it
 * can register commands, behaviors and event listeners. Runs before content
 * loads, so content can refer to what the code registered (e.g. NPC
 * behaviors).
 * @param {ReturnType<typeof readGame>} game
 * @param {import("../World.js").World} world
 */
export async function setUpPackCode(game, world) {
    for (const pack of game.packs) {
        if (!pack.codeFile) {
            continue;
        }
        const module = await import(pathToFileURL(pack.codeFile).href);
        if (typeof module.default !== 'function') {
            throw new Error(`Pack "${pack.name}"'s index.js must export a default setup function.`);
        }
        try {
            await module.default(createPackContext(pack, world));
        } catch (err) {
            err.message = `Pack "${pack.name}" failed to set up: ${err.message}`;
            throw err;
        }
    }
}
