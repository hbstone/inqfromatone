// Where saves live: each game (games/<name>.json) is its own world, with
// its own characters and room state under saves/<game>/. Packs are shared
// between games, saves aren't (see ARCHITECTURE.md's "Saves").
//
// game.js calls useSavesForGame once at startup; data.js and worldData.js
// read these as their default directories. Tests pass their own
// directories instead, and anything that reaches for a default before a
// game is set throws rather than writing somewhere unexpected.
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const REPO_ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const SAVES_ROOT = path.join(REPO_ROOT, 'saves');

let gameDir = null;

/**
 * Point saves at one game's folder: saves/<game>/characters/ and
 * saves/<game>/rooms/. Warns if saves from before the split (top-level
 * characters/ or rooms/) are still sitting there, since they won't load.
 * @param {string} game - A validated game name (see modules/packs/game.js).
 */
export function useSavesForGame(game) {
    gameDir = path.join(SAVES_ROOT, game);
    for (const old of ['characters', 'rooms']) {
        if (hasFiles(path.join(REPO_ROOT, old))) {
            console.warn(
                `Found saves in ${old}/ from before saves were split by game; they won't load. Move them into saves/<game>/${old}/.`,
            );
        }
    }
}

function hasFiles(dir) {
    try {
        return fs.readdirSync(dir, { recursive: true }).some((entry) => entry.endsWith('.json'));
    } catch {
        return false;
    }
}

function requireGame() {
    if (!gameDir) {
        throw new Error("Saves aren't tied to a game yet (call useSavesForGame first, or pass a directory).");
    }
    return gameDir;
}

/** @returns {string} The running game's characters directory. */
export function charactersDir() {
    return path.join(requireGame(), 'characters');
}

/** @returns {string} The running game's rooms directory. */
export function roomsDir() {
    return path.join(requireGame(), 'rooms');
}
