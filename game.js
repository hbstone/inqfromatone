import { World } from './modules/World.js';
import { resolveCommand, explainCommand } from './modules/commands/registry.js';
import './modules/commands/index.js'; // registers the built-in verbs, see index.js
import './modules/checks/index.js'; // registers the default check resolver, see index.js
import './modules/npcs/index.js'; // registers the built-in NPC behaviors (before content loads, so it can check behavior names)
import { startNpcBehaviors } from './modules/npcs/behaviors.js';
import { setWorld as setCombatWorld } from './modules/combat/index.js'; // registers the unarmed attack producer + combat messages, see index.js
import { startRegenTicker } from './modules/combat/regen.js';
import { emit } from './modules/events.js';
import { loadWorldData } from './modules/content/loadWorldData.js';
import { loadStatDefinitions } from './modules/content/loadStatDefinitions.js';
import { disconnectCharacter } from './modules/commands/quit.js';
import { loadRoomStates, saveWorld, startWorldSaveTicker } from './modules/worldPersistence.js';
import { guard } from './modules/guard.js';
import { start as startScheduler } from './modules/scheduler.js';
import { loadTimeSettings, startGameClock } from './modules/gameClock.js';
import { writeToSocket } from './modules/utils.js';
import { createLoginHandler } from './modules/login.js';
import { loadFeatures } from './modules/content/loadFeatures.js';
import { enableRecognition } from './modules/recognition/index.js';
import { readGame, contentDirsOf, setUpPackCode } from './modules/packs/game.js';
import path from 'path';

const game = readGame(); // which packs this game is made of: games/$GAME.json, else games/default.json (see modules/packs/game.js)
console.log(`Starting game "${game.name}" with packs: ${game.packs.map((pack) => pack.name).join(', ')}`);
const contentDirs = contentDirsOf(game);

const world = new World(); // Initialize the world
await setUpPackCode(game, world); // each pack's index.js registers its verbs/behaviors/listeners, before content refers to them
const { startingRoomKey } = loadWorldData(world, contentDirs, { startingRoom: game.startingRoom }); // Load zone/room/item/NPC content
loadRoomStates(world); // Overlay any saved room state (dropped/placed items) onto the content defaults
loadStatDefinitions(contentDirs.map((dir) => path.join(dir, 'stats'))); // Load stat definitions (which stats exist, starting values, roles)
loadTimeSettings(contentDirs); // Load time-of-day settings (speed, named phases)
const features = loadFeatures(contentDirs); // optional engine features this game switches on (packs' features.json)
if (features.recognition) {
    enableRecognition(); // strangers by short description; remember/forget/rename/shortdesc (see modules/recognition/)
}
setCombatWorld(world); // let combat messages reach room bystanders, not just the two combatants
startRegenTicker(world); // passive vitality regen for every online character
startWorldSaveTicker(world); // periodic checkpoint: dirty rooms + every in-world character (see worldPersistence.js)
startGameClock(world); // hour/phase-change events and phase messages (see gameClock.js)
startNpcBehaviors(world); // NPCs wander and chatter (see modules/npcs/behaviors.js)
startScheduler(); // drives every job above in real time (see scheduler.js)

const handleLogin = createLoginHandler({ world, startingRoomKey });

/**
 * Called from server.js when the process is about to exit - a graceful
 * SIGINT/SIGTERM, or a fatal error - so whatever's changed since the last
 * periodic checkpoint isn't lost. Tells everyone online first.
 * @param {string} message - What to tell connected players.
 */
export const saveWorldOnShutdown = (message) => {
    for (const character of world.getOnlineCharacters()) {
        guard('shutdown notice', () => writeToSocket(character.socket, message));
    }
    saveWorld(world);
};

const COMMAND_ERROR = "Something went wrong running that command. It's been logged.";

export const handleCommand = (socket, input) => {
    const character = socket.character;

    if (!character.isLoggedIn) {
        return guard(
            `login for socket ${socket.remoteAddress ?? '?'}`,
            () => handleLogin(socket, input),
            COMMAND_ERROR,
        );
    }

    const [typed, ...args] = input.trim().split(/\s+/);

    // `n?` (or `n?anything`, `n? more words`): say what the first word
    // would run, without running it - see explainCommand. Only a `?` in
    // the first word counts, so `say really?` is still just a say.
    const questionMark = typed.indexOf('?');
    if (questionMark !== -1) {
        return explainCommand(typed.slice(0, questionMark));
    }

    // Case-insensitive, abbreviations allowed (`n`, `L`) - see registry.js.
    const resolved = resolveCommand(typed);
    if (resolved) {
        const { name: command, handler } = resolved;
        // A bug in one command costs that one command, not the server -
        // see modules/guard.js.
        const result = guard(
            `command "${input}" from ${character.name}`,
            () => handler(world, args, character, socket),
            COMMAND_ERROR,
        );
        emit('command', { character, command, args, result, world });
        return result;
    }

    return "I don't understand that command.";
};

// Called whenever a socket closes. For an ungraceful disconnect (no
// `quit`) this still saves the character and cleans up their room,
// instead of leaving a stale entry in room.characters. Skipped if the
// character has since moved to another connection (see
// modules/connection.js) - this socket closing doesn't mean they left.
export const handleDisconnect = (socket) => {
    const character = socket.character;
    if (character.isLoggedIn && character.socket === socket) {
        disconnectCharacter(world, character, `${character.name} has disconnected.`);
    }
};
