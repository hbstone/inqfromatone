// The combat pack (see ARCHITECTURE.md's "Combat" and "Packs"): fights
// between characters, with no knowledge of any particular theme. Leave it
// out of a game's pack list and the game has no combat at all - no kill /
// flee / disengage, no hp, no regen.
//
// lib/ holds the engine: attack producers (registry.js), sessions with
// auto-attacks on the scheduler (session.js), resolving one attack through
// core's check resolver (resolveAttack.js), the player-facing messages and
// default unarmed/weapon attack (attacks.js), and regen (regen.js).
//
// content/stats/ adds `hp` (the vitality role) and gives the starter
// attributes their combat roles (offense: strength, defense: dexterity).
import { setWorld } from './lib/attacks.js';
import { startRegenTicker } from './lib/regen.js';
import { getSession, disengageCombat } from './lib/session.js';
import { kill } from './lib/kill.js';
import { flee } from './lib/flee.js';
import { disengage } from './lib/disengage.js';
import { nameFor } from '../../modules/naming.js';
import { writeToSocket } from '../../modules/utils.js';

export default function setup(pack) {
    setWorld(pack.world); // lets combat messages reach room bystanders, not just the two combatants

    pack.registerCommand('kill', kill, { abbreviate: false }); // be sure
    pack.registerCommand('flee', flee);
    pack.registerCommand('disengage', disengage);

    // A deliberate `quit` shouldn't be a free escape from a fight you're losing.
    pack.registerQuitBlocker((character) =>
        getSession(character) ? "You can't quit in the middle of a fight! Flee or disengage first." : null,
    );

    // Leaving the world any way at all (quit, or a dropped connection)
    // leaves combat first: a fight against someone no longer there would
    // keep running on its timers. If that leaves an opponent with nobody to
    // fight, the session ends for them too (see lib/session.js's
    // checkForSessionEnd) - tell them so.
    pack.on('characterLeaving', ({ character }) => {
        const session = getSession(character);
        if (!session) {
            return;
        }
        const opponents = Array.from(session.participants.keys()).filter((c) => c !== character);
        disengageCombat(character);
        for (const opponent of opponents) {
            if (opponent.socket && !getSession(opponent)) {
                writeToSocket(opponent.socket, `${nameFor(character, opponent)} is gone - you are no longer fighting.`);
            }
        }
    });

    startRegenTicker(pack.world); // passive vitality regen for every online character
}
