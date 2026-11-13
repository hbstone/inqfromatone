// Core's built-in NPC behaviors - the "core pack" of them, the same framing
// as modules/commands/index.js. Deliberately generic and non-combat; theme
// packs register their own (a blacksmith hammering, a guard's patrol) with
// registerBehavior. See ARCHITECTURE.md's "NPCs".
import { registerBehavior, pick } from './behaviors.js';
import { movePlayer, OPPOSITES } from '../commands/move.js';
import { nameFor, tellRoom } from '../naming.js';

// "wander": { "chance", "leaveZone"? } - step through a random exit. Stays
// inside the NPC's current zone unless leaveZone is true, so a town's
// NPCs don't drift off into the woods.
registerBehavior('wander', ({ npc, settings, world, random }) => {
    const room = world.getRoomById(npc.roomId);
    const options = Object.entries(room.exits).filter(([direction, targetId]) => {
        const target = world.getRoomById(targetId);
        return OPPOSITES[direction] && target && (settings.leaveZone || target.zone === room.zone);
    });
    const choice = pick(options, random);
    if (!choice) {
        return false;
    }
    const [direction] = choice;
    movePlayer(world, npc, room, direction, OPPOSITES[direction]);
    return true;
});

// "ambient": { "chance", "says"?: [...], "emotes"?: [...] } - a line of
// flavor to the room: `says` lines are spoken ("An old groundskeeper says,
// "..."") and `emotes` follow the name ("An old groundskeeper hums.").
// Only when a player is there to see it. (No need to capitalize "an old
// groundskeeper" here: writeToSocket capitalizes every line's first letter.)
registerBehavior('ambient', ({ npc, settings, world, random }) => {
    const room = world.getRoomById(npc.roomId);
    if (!room.characters.some((c) => c.socket)) {
        return false;
    }
    const lines = [
        ...(settings.says ?? []).map((text) => (viewer) => `${nameFor(npc, viewer)} says, "${text}"`),
        ...(settings.emotes ?? []).map((text) => (viewer) => `${nameFor(npc, viewer)} ${text}`),
    ];
    const render = pick(lines, random);
    if (!render) {
        return false;
    }
    tellRoom(room, render);
    return true;
});
