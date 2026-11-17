// Loads zone/room/item definitions out of JSON data files into a World
// (see ARCHITECTURE.md's "Zones" and "Packs"). Content comes from each of
// the game's packs, in order - every pack's content/ directory may hold:
//
//   items.json                 items, merged across packs (mergeByKey.js)
//   zones/<zone>/zone.json     { name, description?, indoors? }
//   zones/<zone>/rooms.json    that zone's rooms
//   zones/<zone>/npcs.json     that zone's NPC templates (optional)
//
// Everything is namespaced by its pack, so two packs can both have a
// "town" zone or a "rope" item. World ids:
//
//   zone   "<pack>/<zone>"
//   room   "<pack>/<zone>/<room key>"
//   NPC    "<pack>/<zone>/<npc key>"
//   item   "<pack>/<item key>"
//
// References are written relative to where they appear: in exits, a
// room's "npcs" list and routine posts, "key" is in the same zone,
// "zone/key" in the same pack, and "pack/zone/key" anywhere. In a room's
// "items" list, "key" is the same pack's item and "pack/key" another's.
//
// NPCs are spawned fresh from these templates every boot, one per entry in
// a room's "npcs" list - they aren't saved (see modules/Npc.js).
import fs from 'fs';
import path from 'path';
import { Item } from '../Item.js';
import { Npc } from '../Npc.js';
import { hasBehavior } from '../npcs/behaviors.js';
import { validateDialogue } from '../npcs/dialogue.js';
import { validateSenses } from '../senses.js';
import { assertUniqueKeys } from './assertUniqueKeys.js';
import { mergeByKey, sourceName } from './mergeByKey.js';
import { defaultContentDirs } from '../packs/game.js';
import { addItem } from '../stacking.js';
import { assertValidKey } from './keys.js';
import { readJson } from './readJson.js';

/**
 * A room's (or NPC template's) World id from a reference written inside a
 * zone: "key" is in this zone, "zone/key" in this pack, and
 * "pack/zone/key" is used as-is.
 * @param {string} ref
 * @param {string} pack - The pack the reference was written in.
 * @param {string} zoneKey - The zone (within that pack) it was written in.
 * @returns {string}
 */
export function resolveRoomRef(ref, pack, zoneKey) {
    switch (ref.split('/').length) {
        case 1:
            return `${pack}/${zoneKey}/${ref}`;
        case 2:
            return `${pack}/${ref}`;
        default:
            return ref;
    }
}

/**
 * An item's World id from a reference written inside a pack: "key" is
 * this pack's, "pack/key" is used as-is.
 * @param {string} ref
 * @param {string} pack
 * @returns {string}
 */
export function resolveItemRef(ref, pack) {
    return ref.includes('/') ? ref : `${pack}/${ref}`;
}

/**
 * A pack's items.json entries with their keys made into World ids. An
 * entry's own key is bare; a "pack/key" id is only allowed on an
 * `"override": true` entry, to replace another pack's item.
 * @param {object[]} entries
 * @param {string} pack
 * @returns {object[]}
 */
function namespaceItems(entries, pack) {
    return entries.map((entry) => {
        if (!entry.key) {
            return entry;
        }
        if (entry.key.includes('/')) {
            if (!entry.override) {
                throw new Error(
                    `Item "${entry.key}" in "${pack}": a "pack/key" id names another pack's item, which only an "override": true entry may do.`,
                );
            }
            return entry;
        }
        assertValidKey(entry.key, 'item');
        return { ...entry, key: `${pack}/${entry.key}` };
    });
}

/**
 * Load zone/room/item content data into a World.
 * @param {import("../World.js").World} world
 * @param {string|string[]} [contentDirs] - Content directories (each may
 *   hold items.json and zones/), one per pack in game order; a single path
 *   works too. Defaults to the default game's packs (see
 *   modules/packs/game.js). A pack's name, which namespaces its ids, is
 *   the folder holding its content/ (see mergeByKey.js's sourceName).
 *   Items merge across packs (see mergeByKey.js).
 * @param {{ startingRoom?: string|null }} [options] - The game config's
 *   startingRoom (a full "pack/zone/room" id), which beats any room's
 *   "isStartingRoom".
 * @returns {{ startingRoomKey: string|null }} The starting room's World id.
 */
export function loadWorldData(world, contentDirs = defaultContentDirs(), { startingRoom = null } = {}) {
    const packs = [contentDirs].flat().map((dir) => {
        const pack = sourceName(dir, path);
        assertValidKey(pack, 'pack');
        return { pack, dir };
    });
    const seenPacks = new Set();
    for (const { pack } of packs) {
        if (seenPacks.has(pack)) {
            throw new Error(`Pack "${pack}" is loaded twice.`);
        }
        seenPacks.add(pack);
    }

    // item id -> definition
    const items = new Map(
        mergeByKey(
            packs
                .filter(({ dir }) => fs.existsSync(path.join(dir, 'items.json')))
                .map(({ pack, dir }) => ({
                    source: pack,
                    entries: namespaceItems(readJson(path.join(dir, 'items.json')), pack),
                })),
            'item',
        ).map((item) => [item.key, item]),
    );

    // Every pack's zones: in pack order, then by key within a pack.
    const zoneDirs = []; // { pack, zoneKey, dir }
    for (const { pack, dir } of packs) {
        const zonesDir = path.join(dir, 'zones');
        if (!fs.existsSync(zonesDir)) continue;
        const entries = fs.readdirSync(zonesDir, { withFileTypes: true }).filter((entry) => entry.isDirectory());
        for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
            zoneDirs.push({ pack, zoneKey: entry.name, dir: path.join(zonesDir, entry.name) });
        }
    }

    // [{ pack, zoneKey, zoneId, rooms }] - rooms as authored, for the second pass.
    const zones = [];
    // "<pack>/<zone>/<key>" -> NPC template, from every zone's npcs.json
    const npcTemplates = new Map();
    const startingRooms = [];

    // First pass: create every zone and room, so exit/item references
    // below can target any of them regardless of declaration order.
    for (const { pack, zoneKey, dir: zoneDir } of zoneDirs) {
        assertValidKey(zoneKey, 'zone');
        const zoneId = `${pack}/${zoneKey}`;
        const zoneData = readJson(path.join(zoneDir, 'zone.json'));
        const rooms = readJson(path.join(zoneDir, 'rooms.json'));
        assertUniqueKeys(rooms, `room (zone "${zoneId}")`);
        const npcsFile = path.join(zoneDir, 'npcs.json');
        const npcs = fs.existsSync(npcsFile) ? readJson(npcsFile) : [];
        assertUniqueKeys(npcs, `NPC (zone "${zoneId}")`);
        for (const npcData of npcs) {
            if (!npcData.key || !npcData.name) {
                console.warn(`Skipping NPC with missing key/name in zone "${zoneId}":`, npcData);
                continue;
            }
            assertValidKey(npcData.key, 'NPC');
            const npcId = `${zoneId}/${npcData.key}`;
            validateDialogue(npcData, npcId);
            validateSenses(npcData.senses, `NPC "${npcId}"`);
            if (npcData.persona !== undefined && !(typeof npcData.persona === 'string' && npcData.persona.trim())) {
                throw new Error(`NPC "${npcId}"'s "persona" must be some text.`);
            }
            (npcData.routine ?? []).forEach((entry, index) =>
                validateSenses(entry.senses, `NPC "${npcId}" routine post ${index + 1}`),
            );
            for (const behavior of Object.keys(npcData.behaviors ?? {})) {
                if (!hasBehavior(behavior)) {
                    console.warn(`NPC "${npcId}" has unknown behavior "${behavior}"; it will be ignored.`);
                }
            }
            for (const entry of npcData.routine ?? []) {
                for (const behavior of Object.keys(entry.behaviors ?? {})) {
                    if (!hasBehavior(behavior)) {
                        console.warn(
                            `NPC "${npcId}" has unknown behavior "${behavior}" in its routine; it will be ignored.`,
                        );
                    }
                }
            }
            npcTemplates.set(npcId, {
                ...npcData,
                id: npcId,
                // Posts are written like exits: a bare key is in the NPC's own zone
                routine: (npcData.routine ?? []).map((entry) => ({
                    ...entry,
                    roomId: resolveRoomRef(entry.at ?? '', pack, zoneKey),
                })),
            });
        }

        world.addZone(zoneId, {
            name: zoneData.name ?? zoneKey,
            description: zoneData.description ?? '',
            indoors: zoneData.indoors === true,
        });
        zones.push({ pack, zoneKey, zoneId, rooms });

        for (const roomData of rooms) {
            if (!roomData.key || !roomData.name) {
                console.warn(`Skipping room with missing key/name in zone "${zoneId}":`, roomData);
                continue;
            }
            assertValidKey(roomData.key, 'room');
            const id = world.addRoom(roomData.name, roomData.description ?? '', `${zoneId}/${roomData.key}`);
            const room = world.getRoomById(id);
            room.zone = zoneId;
            // A room inherits its zone's setting unless it says otherwise:
            // "indoors": false makes a courtyard inside an indoor zone.
            room.indoors = roomData.indoors ?? world.getZone(zoneId).indoors;
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
            throw new Error(
                `The game's startingRoom "${startingRoom}" isn't a room any of its packs define (it needs the full "pack/zone/room" id).`,
            );
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
    for (const { pack, zoneKey, zoneId, rooms } of zones) {
        for (const roomData of rooms) {
            if (!roomData.key || !roomData.name) continue;
            const room = world.getRoomById(`${zoneId}/${roomData.key}`);

            for (const [direction, targetRef] of Object.entries(roomData.exits ?? {})) {
                const targetId = resolveRoomRef(targetRef, pack, zoneKey);
                if (!world.getRoomById(targetId)) {
                    console.warn(`Skipping exit "${direction}" from "${room.id}": unknown room "${targetId}".`);
                    continue;
                }
                room.exits[direction] = targetId;
            }

            for (const itemRef of roomData.items ?? []) {
                const itemId = resolveItemRef(itemRef, pack);
                const itemData = items.get(itemId);
                if (!itemData) {
                    console.warn(`Skipping item "${itemId}" in room "${room.id}": no such item defined.`);
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
                        equip: itemData.equip ?? null,
                        stackable: itemData.stackable ?? false,
                    }),
                );
            }

            for (const npcRef of roomData.npcs ?? []) {
                const template = npcTemplates.get(resolveRoomRef(npcRef, pack, zoneKey));
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
