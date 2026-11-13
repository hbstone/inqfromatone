// Loads zone/room/item definitions out of JSON data files into a World
// (see ARCHITECTURE.md's "Zones" and "Packs"). Content comes from each of
// the game's packs, in order - every pack's content/ directory may hold:
//
//   items.json                 items, merged across packs (mergeByKey.js)
//   zones/<zone>/zone.json     { name, description?, indoors? }
//   zones/<zone>/rooms.json    that zone's rooms
//   zones/<zone>/npcs.json     that zone's NPC templates (optional)
//
// A zone belongs to exactly one pack; exits and NPC lists can point into
// any pack's zones.
//
// A room's id in the World is "<zone>/<room key>", and an NPC template's is
// "<zone>/<npc key>". Exits, and a room's "npcs" list, may use a bare key
// for something in the same zone, or a full "<zone>/<key>" id for one in
// another zone.
//
// NPCs are spawned fresh from these templates every boot, one per entry in
// a room's "npcs" list - they aren't saved (see modules/Npc.js).
import fs from 'fs';
import path from 'path';
import { Item } from '../Item.js';
import { Npc } from '../Npc.js';
import { hasBehavior } from '../npcs/behaviors.js';
import { assertUniqueKeys } from './assertUniqueKeys.js';
import { mergeByKey, sourceName } from './mergeByKey.js';
import { defaultContentDirs } from '../packs/game.js';
import { addItem } from '../stacking.js';

// Zone and room keys end up in save-file paths (rooms/<zone>/<key>.json, see
// worldData.js), so keep them to a filename-safe shape rather than relying
// on content always being well-behaved (see ROADMAP.md's note on treating
// packs as semi-trusted).
const KEY_PATTERN = /^[a-z0-9][a-z0-9-]*$/;

function readJson(filePath) {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function assertValidKey(key, label) {
    if (!KEY_PATTERN.test(key)) {
        throw new Error(`Invalid ${label} key "${key}": use lowercase letters, digits, and dashes.`);
    }
}

/**
 * A room's (or NPC template's) World id from a reference written inside a
 * zone: a bare key means "in this zone", a "zone/key" id is used as-is.
 * @param {string} ref
 * @param {string} zoneKey - The zone the reference was written in.
 * @returns {string}
 */
export function resolveRoomRef(ref, zoneKey) {
    return ref.includes('/') ? ref : `${zoneKey}/${ref}`;
}

/**
 * Load zone/room/item content data into a World.
 * @param {import("../World.js").World} world
 * @param {string|string[]} [contentDirs] - Content directories (each may
 *   hold items.json and zones/), one per pack in game order; a single path
 *   works too. Defaults to the default game's packs (see
 *   modules/packs/game.js). Items merge across packs (see mergeByKey.js);
 *   a zone key may only be used by one pack.
 * @param {{ startingRoom?: string|null }} [options] - The game config's
 *   startingRoom, which beats any room's "isStartingRoom".
 * @returns {{ startingRoomKey: string|null }} The starting room's World id.
 */
export function loadWorldData(world, contentDirs = defaultContentDirs(), { startingRoom = null } = {}) {
    const dirs = [contentDirs].flat();

    const items = mergeByKey(
        dirs
            .filter((dir) => fs.existsSync(path.join(dir, 'items.json')))
            .map((dir) => ({ source: sourceName(dir, path), entries: readJson(path.join(dir, 'items.json')) })),
        'item',
    );

    // Every pack's zones, by key; a zone belongs to exactly one pack.
    const zoneDirs = new Map(); // zone key -> { dir, source }
    for (const dir of dirs) {
        const zonesDir = path.join(dir, 'zones');
        if (!fs.existsSync(zonesDir)) continue;
        for (const entry of fs.readdirSync(zonesDir, { withFileTypes: true })) {
            if (!entry.isDirectory()) continue;
            const source = sourceName(dir, path);
            const existing = zoneDirs.get(entry.name);
            if (existing) {
                throw new Error(
                    `Zone "${entry.name}" is defined by both "${existing.source}" and "${source}"; zone keys must be unique across a game's packs.`,
                );
            }
            zoneDirs.set(entry.name, { dir: path.join(zonesDir, entry.name), source });
        }
    }
    const zoneKeys = Array.from(zoneDirs.keys()).sort();

    // [{ zoneKey, rooms }] - rooms as authored, for the second pass.
    const zones = [];
    // "<zone>/<key>" -> NPC template, from every zone's npcs.json
    const npcTemplates = new Map();
    const startingRooms = [];

    // First pass: create every zone and room, so exit/item references
    // below can target any of them regardless of declaration order.
    for (const zoneKey of zoneKeys) {
        assertValidKey(zoneKey, 'zone');
        const zoneDir = zoneDirs.get(zoneKey).dir;
        const zoneData = readJson(path.join(zoneDir, 'zone.json'));
        const rooms = readJson(path.join(zoneDir, 'rooms.json'));
        assertUniqueKeys(rooms, `room (zone "${zoneKey}")`);
        const npcsFile = path.join(zoneDir, 'npcs.json');
        const npcs = fs.existsSync(npcsFile) ? readJson(npcsFile) : [];
        assertUniqueKeys(npcs, `NPC (zone "${zoneKey}")`);
        for (const npcData of npcs) {
            if (!npcData.key || !npcData.name) {
                console.warn(`Skipping NPC with missing key/name in zone "${zoneKey}":`, npcData);
                continue;
            }
            assertValidKey(npcData.key, 'NPC');
            for (const behavior of Object.keys(npcData.behaviors ?? {})) {
                if (!hasBehavior(behavior)) {
                    console.warn(
                        `NPC "${zoneKey}/${npcData.key}" has unknown behavior "${behavior}"; it will be ignored.`,
                    );
                }
            }
            for (const entry of npcData.routine ?? []) {
                for (const behavior of Object.keys(entry.behaviors ?? {})) {
                    if (!hasBehavior(behavior)) {
                        console.warn(
                            `NPC "${zoneKey}/${npcData.key}" has unknown behavior "${behavior}" in its routine; it will be ignored.`,
                        );
                    }
                }
            }
            npcTemplates.set(`${zoneKey}/${npcData.key}`, {
                ...npcData,
                id: `${zoneKey}/${npcData.key}`,
                // Posts are written like exits: a bare key is in the NPC's own zone
                routine: (npcData.routine ?? []).map((entry) => ({
                    ...entry,
                    roomId: resolveRoomRef(entry.at ?? '', zoneKey),
                })),
            });
        }

        world.addZone(zoneKey, {
            name: zoneData.name ?? zoneKey,
            description: zoneData.description ?? '',
            indoors: zoneData.indoors === true,
        });
        zones.push({ zoneKey, rooms });

        for (const roomData of rooms) {
            if (!roomData.key || !roomData.name) {
                console.warn(`Skipping room with missing key/name in zone "${zoneKey}":`, roomData);
                continue;
            }
            assertValidKey(roomData.key, 'room');
            const id = world.addRoom(roomData.name, roomData.description ?? '', `${zoneKey}/${roomData.key}`);
            const room = world.getRoomById(id);
            room.zone = zoneKey;
            // A room inherits its zone's setting unless it says otherwise:
            // "indoors": false makes a courtyard inside an indoor zone.
            room.indoors = roomData.indoors ?? world.getZone(zoneKey).indoors;
            if (roomData.isStartingRoom) {
                startingRooms.push(id);
            }
        }
    }

    // The game config's choice wins outright; packs' own "isStartingRoom"
    // flags are the fallback (a pack used on its own, or tests).
    let startingRoomKey = startingRoom ?? startingRooms[0] ?? null;
    if (startingRoom) {
        if (!world.getRoomById(startingRoom)) {
            throw new Error(`The game's startingRoom "${startingRoom}" isn't a room any of its packs define.`);
        }
    } else if (startingRooms.length > 1) {
        console.warn(
            `More than one room marked "isStartingRoom" (${startingRooms.join(', ')}); using ${startingRoomKey}.`,
        );
    }
    if (!startingRoomKey) {
        startingRoomKey = world.getAllRooms()[0]?.id ?? null;
        if (startingRoomKey) {
            console.warn(`No room marked "isStartingRoom"; defaulting to ${startingRoomKey}.`);
        }
    }

    // Every room exists now, so routine posts can be checked. A post that
    // names a missing room is dropped; the rest of the routine still runs.
    for (const template of npcTemplates.values()) {
        template.routine = template.routine.filter((entry) => {
            const valid =
                typeof entry.from === 'number'
                    ? Number.isInteger(entry.from) && entry.from >= 0 && entry.from <= 23
                    : typeof entry.from === 'string';
            if (!valid) {
                console.warn(
                    `Skipping a routine entry for NPC "${template.id}": "from" must be an hour (0-23) or a phase name, got ${JSON.stringify(entry.from)}.`,
                );
                return false;
            }
            if (!world.getRoomById(entry.roomId)) {
                console.warn(`Skipping a routine entry for NPC "${template.id}": unknown room "${entry.roomId}".`);
                return false;
            }
            return true;
        });
    }

    // Second pass: wire up exits and place items, now that every room id
    // is guaranteed to resolve.
    for (const { zoneKey, rooms } of zones) {
        for (const roomData of rooms) {
            if (!roomData.key || !roomData.name) continue;
            const room = world.getRoomById(`${zoneKey}/${roomData.key}`);

            for (const [direction, targetRef] of Object.entries(roomData.exits ?? {})) {
                const targetId = resolveRoomRef(targetRef, zoneKey);
                if (!world.getRoomById(targetId)) {
                    console.warn(`Skipping exit "${direction}" from "${room.id}": unknown room "${targetId}".`);
                    continue;
                }
                room.exits[direction] = targetId;
            }

            for (const itemKey of roomData.items ?? []) {
                const itemData = items.find((item) => item.key === itemKey);
                if (!itemData) {
                    console.warn(`Skipping item "${itemKey}" in room "${room.id}": no such item defined.`);
                    continue;
                }
                // addItem (not a raw push) so repeated stackable keys - the
                // same "list it N times" convention already used for
                // non-stackable proof content like the bricks - collapse into
                // one stack at load time instead of staying N separate objects.
                addItem(
                    room.inventory,
                    new Item(itemData.name, itemData.description, itemData.keywords ?? [], {
                        size: itemData.size,
                        weight: itemData.weight,
                        container: itemData.container ?? null,
                        stackable: itemData.stackable ?? false,
                    }),
                );
            }

            for (const npcRef of roomData.npcs ?? []) {
                const template = npcTemplates.get(resolveRoomRef(npcRef, zoneKey));
                if (!template) {
                    console.warn(`Skipping NPC "${npcRef}" in room "${room.id}": no such NPC defined.`);
                    continue;
                }
                const npc = new Npc(template, room.id);
                room.addCharacter(npc);
                world.npcs.push(npc);
            }
        }
    }

    return { startingRoomKey };
}
