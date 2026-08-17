// Loads room/item definitions out of JSON data files into a World, instead
// of them being hardcoded in JS (see ARCHITECTURE.md's Phase 1 build
// order). This is effectively "core's" content for now — the same "core
// pack" framing already used for modules/commands/index.js — living at the
// repo's top-level content/ directory rather than nested under a real pack
// layout, since that's Phase 4 scope.
//
// NPC definitions aren't handled here: there's no NPC entity/class in the
// codebase yet, so there's nothing real to load data into (Phase 3).
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { Item } from "../Item.js";

const DEFAULT_CONTENT_DIR = path.join(
    path.dirname(fileURLToPath(import.meta.url)),
    "..", "..", "content"
);

function readJson(filePath) {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

/**
 * Load room/item content data into a World.
 * @param {import("../World.js").World} world
 * @param {string} [contentDir] - Directory containing rooms.json/items.json.
 *   Defaults to the repo's top-level content/ directory. Overridable so
 *   tests (or, eventually, other packs) can point at their own data.
 * @returns {{ startingRoomKey: string|null }}
 */
export function loadWorldData(world, contentDir = DEFAULT_CONTENT_DIR) {
    const rooms = readJson(path.join(contentDir, "rooms.json"));
    const items = readJson(path.join(contentDir, "items.json"));

    let startingRoomKey = null;

    // First pass: create every room, so exit/item references below can
    // target any of them regardless of declaration order.
    for (const room of rooms) {
        if (!room.key || !room.name) {
            console.warn("Skipping room with missing key/name:", room);
            continue;
        }
        world.addRoom(room.name, room.description ?? "", room.key);
        if (room.isStartingRoom) {
            startingRoomKey = room.key;
        }
    }

    if (!startingRoomKey && rooms.length > 0) {
        console.warn('No room marked "isStartingRoom"; defaulting to the first room.');
        startingRoomKey = rooms[0].key;
    }

    // Second pass: wire up exits and place items, now that every room key
    // is guaranteed to resolve.
    for (const roomData of rooms) {
        if (!roomData.key) continue;
        const room = world.getRoomById(roomData.key);

        for (const [direction, targetKey] of Object.entries(roomData.exits ?? {})) {
            if (!world.getRoomById(targetKey)) {
                console.warn(`Skipping exit "${direction}" from "${roomData.key}": unknown room "${targetKey}".`);
                continue;
            }
            room.exits[direction] = targetKey;
        }

        for (const itemKey of roomData.items ?? []) {
            const itemData = items.find(item => item.key === itemKey);
            if (!itemData) {
                console.warn(`Skipping item "${itemKey}" in room "${roomData.key}": no such item defined.`);
                continue;
            }
            room.inventory.push(new Item(itemData.name, itemData.description, itemData.keywords ?? []));
        }
    }

    return { startingRoomKey };
}
