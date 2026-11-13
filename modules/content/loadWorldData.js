// Loads zone/room/item definitions out of JSON data files into a World,
// instead of them being hardcoded in JS (see ARCHITECTURE.md's Phase 1
// build order and "Zones"). This is effectively "core's" content for now -
// the same "core pack" framing already used for modules/commands/index.js -
// living at the repo's top-level content/ directory rather than nested
// under a real pack layout, since that's Phase 4 scope.
//
// Layout:
//   content/items.json                 shared item catalog
//   content/zones/<zone>/zone.json     { name, description?, indoors? }
//   content/zones/<zone>/rooms.json    that zone's rooms
//   content/zones/<zone>/npcs.json     that zone's NPC templates (optional)
//
// A room's id in the World is "<zone>/<room key>", and an NPC template's is
// "<zone>/<npc key>". Exits, and a room's "npcs" list, may use a bare key
// for something in the same zone, or a full "<zone>/<key>" id for one in
// another zone.
//
// NPCs are spawned fresh from these templates every boot, one per entry in
// a room's "npcs" list - they aren't saved (see modules/Npc.js).
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { Item } from "../Item.js";
import { Npc } from "../Npc.js";
import { hasBehavior } from "../npcs/behaviors.js";
import { assertUniqueKeys } from "./assertUniqueKeys.js";
import { addItem } from "../stacking.js";

const DEFAULT_CONTENT_DIR = path.join(
    path.dirname(fileURLToPath(import.meta.url)),
    "..", "..", "content"
);

// Zone and room keys end up in save-file paths (rooms/<zone>/<key>.json, see
// worldData.js), so keep them to a filename-safe shape rather than relying
// on content always being well-behaved (see ROADMAP.md's note on treating
// packs as semi-trusted).
const KEY_PATTERN = /^[a-z0-9][a-z0-9-]*$/;

function readJson(filePath) {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
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
    return ref.includes("/") ? ref : `${zoneKey}/${ref}`;
}

/**
 * Load zone/room/item content data into a World.
 * @param {import("../World.js").World} world
 * @param {string} [contentDir] - Directory containing items.json and
 *   zones/. Defaults to the repo's top-level content/ directory.
 *   Overridable so tests (or, eventually, other packs) can point at their
 *   own data.
 * @returns {{ startingRoomKey: string|null }} The starting room's World id.
 */
export function loadWorldData(world, contentDir = DEFAULT_CONTENT_DIR) {
    const items = readJson(path.join(contentDir, "items.json"));
    assertUniqueKeys(items, "item");

    const zonesDir = path.join(contentDir, "zones");
    const zoneKeys = fs.readdirSync(zonesDir, { withFileTypes: true })
        .filter(entry => entry.isDirectory())
        .map(entry => entry.name)
        .sort();

    // [{ zoneKey, rooms }] - rooms as authored, for the second pass.
    const zones = [];
    // "<zone>/<key>" -> NPC template, from every zone's npcs.json
    const npcTemplates = new Map();
    const startingRooms = [];

    // First pass: create every zone and room, so exit/item references
    // below can target any of them regardless of declaration order.
    for (const zoneKey of zoneKeys) {
        assertValidKey(zoneKey, "zone");
        const zoneDir = path.join(zonesDir, zoneKey);
        const zoneData = readJson(path.join(zoneDir, "zone.json"));
        const rooms = readJson(path.join(zoneDir, "rooms.json"));
        assertUniqueKeys(rooms, `room (zone "${zoneKey}")`);
        const npcsFile = path.join(zoneDir, "npcs.json");
        const npcs = fs.existsSync(npcsFile) ? readJson(npcsFile) : [];
        assertUniqueKeys(npcs, `NPC (zone "${zoneKey}")`);
        for (const npcData of npcs) {
            if (!npcData.key || !npcData.name) {
                console.warn(`Skipping NPC with missing key/name in zone "${zoneKey}":`, npcData);
                continue;
            }
            assertValidKey(npcData.key, "NPC");
            for (const behavior of Object.keys(npcData.behaviors ?? {})) {
                if (!hasBehavior(behavior)) {
                    console.warn(`NPC "${zoneKey}/${npcData.key}" has unknown behavior "${behavior}"; it will be ignored.`);
                }
            }
            for (const entry of npcData.routine ?? []) {
                for (const behavior of Object.keys(entry.behaviors ?? {})) {
                    if (!hasBehavior(behavior)) {
                        console.warn(`NPC "${zoneKey}/${npcData.key}" has unknown behavior "${behavior}" in its routine; it will be ignored.`);
                    }
                }
            }
            npcTemplates.set(`${zoneKey}/${npcData.key}`, {
                ...npcData,
                id: `${zoneKey}/${npcData.key}`,
                // Posts are written like exits: a bare key is in the NPC's own zone
                routine: (npcData.routine ?? []).map(entry => ({ ...entry, roomId: resolveRoomRef(entry.at ?? "", zoneKey) })),
            });
        }

        world.addZone(zoneKey, {
            name: zoneData.name ?? zoneKey,
            description: zoneData.description ?? "",
            indoors: zoneData.indoors === true,
        });
        zones.push({ zoneKey, rooms });

        for (const roomData of rooms) {
            if (!roomData.key || !roomData.name) {
                console.warn(`Skipping room with missing key/name in zone "${zoneKey}":`, roomData);
                continue;
            }
            assertValidKey(roomData.key, "room");
            const id = world.addRoom(roomData.name, roomData.description ?? "", `${zoneKey}/${roomData.key}`);
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

    let startingRoomKey = startingRooms[0] ?? null;
    if (startingRooms.length > 1) {
        console.warn(`More than one room marked "isStartingRoom" (${startingRooms.join(", ")}); using ${startingRoomKey}.`);
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
        template.routine = template.routine.filter(entry => {
            const valid = typeof entry.from === "number" ? Number.isInteger(entry.from) && entry.from >= 0 && entry.from <= 23 : typeof entry.from === "string";
            if (!valid) {
                console.warn(`Skipping a routine entry for NPC "${template.id}": "from" must be an hour (0-23) or a phase name, got ${JSON.stringify(entry.from)}.`);
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
                const itemData = items.find(item => item.key === itemKey);
                if (!itemData) {
                    console.warn(`Skipping item "${itemKey}" in room "${room.id}": no such item defined.`);
                    continue;
                }
                // addItem (not a raw push) so repeated stackable keys - the
                // same "list it N times" convention already used for
                // non-stackable proof content like the bricks - collapse into
                // one stack at load time instead of staying N separate objects.
                addItem(room.inventory, new Item(itemData.name, itemData.description, itemData.keywords ?? [], {
                    size: itemData.size,
                    weight: itemData.weight,
                    container: itemData.container ?? null,
                    stackable: itemData.stackable ?? false,
                }));
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
