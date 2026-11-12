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
//
// A room's id in the World is "<zone>/<room key>". Exits and the starting
// room may use a bare key for a room in the same zone, or a full
// "<zone>/<key>" id for one in another zone.
//
// NPC definitions aren't handled here: there's no NPC entity/class in the
// codebase yet, so there's nothing real to load data into (Phase 3).
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { Item } from "../Item.js";
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
 * A room's World id from a reference written inside a zone: a bare key
 * means "in this zone", a "zone/key" id is used as-is.
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
    const startingRooms = [];

    // First pass: create every zone and room, so exit/item references
    // below can target any of them regardless of declaration order.
    for (const zoneKey of zoneKeys) {
        assertValidKey(zoneKey, "zone");
        const zoneDir = path.join(zonesDir, zoneKey);
        const zoneData = readJson(path.join(zoneDir, "zone.json"));
        const rooms = readJson(path.join(zoneDir, "rooms.json"));
        assertUniqueKeys(rooms, `room (zone "${zoneKey}")`);

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
        }
    }

    return { startingRoomKey };
}
