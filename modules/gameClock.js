// In-game time of day (see ARCHITECTURE.md's Game clock section).
//
// Game time is derived from the wall clock, not counted up while the server
// runs: game time = (real time since EPOCH) x speed. So it never needs
// saving, it keeps moving while the server is down (a restart doesn't
// freeze the world at the hour it went down), and everyone - including
// players coordinating outside the game ("meet at dusk") - sees the same
// clock.
//
// The engine owns only the mechanism: a 24-hour day, a day count, and
// named phases with an optional broadcast message. Everything themed lives
// in content/time.json: how fast time runs, what the phases are called,
// when they start, and what players see when one begins. Calendars (month
// and year names, seasons, holidays) are theme territory; they can be built
// from the day number and the "hourChange"/"phaseChange" events below.
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { emit } from "./events.js";
import { every } from "./scheduler.js";
import { writeToSocket } from "./utils.js";

const DEFAULT_TIME_FILE = path.join(
    path.dirname(fileURLToPath(import.meta.url)),
    "..", "content", "time.json"
);

// Day 1 begins at midnight game time on this instant. Fixed rather than
// "when the server first started", so game time never depends on any
// saved state.
const EPOCH = Date.parse("2026-01-01T00:00:00Z");

const MINUTES_PER_DAY = 24 * 60;
const MS_PER_MINUTE = 60 * 1000;

// Game minutes pass every 60s / speed of real time, so checking every
// second never misses an hour boundary at any sane speed.
const CHECK_INTERVAL_MS = 1000;

let speed = 1;
let phases = []; // sorted by startHour

/**
 * Load the time settings, replacing whatever was loaded before.
 * @param {string} [filePath] - Defaults to content/time.json. Overridable
 *   for tests.
 */
export function loadTimeSettings(filePath = DEFAULT_TIME_FILE) {
    const settings = JSON.parse(fs.readFileSync(filePath, "utf8"));
    if (!(settings.speed > 0)) {
        throw new Error(`Time settings need a positive "speed", got ${settings.speed}.`);
    }
    for (const phase of settings.phases ?? []) {
        if (!Number.isInteger(phase.startHour) || phase.startHour < 0 || phase.startHour > 23) {
            throw new Error(`Time phase "${phase.name}" needs a whole-number startHour from 0 to 23.`);
        }
    }
    speed = settings.speed;
    phases = [...(settings.phases ?? [])].sort((a, b) => a.startHour - b.startHour);
}

// The phase in effect at an hour: the latest one that's started by then.
// Before the first phase of the day starts, the last one (e.g. night)
// carries over from the day before.
function phaseAt(hour) {
    let current = phases[phases.length - 1] ?? null;
    for (const phase of phases) {
        if (phase.startHour <= hour) {
            current = phase;
        }
    }
    return current;
}

/**
 * The in-game time at a real instant.
 * @param {number} [now] - Real time in ms (Date.now()).
 * @returns {{ day: number, hour: number, minute: number, phase: string|null }}
 */
export function getGameTime(now = Date.now()) {
    const totalMinutes = Math.floor(((now - EPOCH) * speed) / MS_PER_MINUTE);
    const minuteOfDay = ((totalMinutes % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY;
    const hour = Math.floor(minuteOfDay / 60);
    return {
        day: Math.floor(totalMinutes / MINUTES_PER_DAY) + 1,
        hour,
        minute: minuteOfDay % 60,
        phase: phaseAt(hour)?.name ?? null,
    };
}

/**
 * Start watching for hour and phase changes. On each new hour, emits
 * "hourChange"; when that hour starts a new phase, also emits
 * "phaseChange" and tells everyone online the phase's message, if it has
 * one. Called once from game.js.
 * @param {import("./World.js").World} world
 * @param {() => number} [now] - Real-time source. Overridable for tests.
 * @returns {{ cancel: () => void }} The scheduler job.
 */
export function startGameClock(world, now = Date.now) {
    let last = getGameTime(now());

    return every("game clock", CHECK_INTERVAL_MS, () => {
        const time = getGameTime(now());
        if (time.hour === last.hour && time.day === last.day) {
            return;
        }
        const previous = last;
        last = time;

        emit("hourChange", { time, world });

        if (time.phase === previous.phase) {
            return;
        }
        emit("phaseChange", { from: previous.phase, to: time.phase, time, world });

        const message = phaseAt(time.hour)?.message;
        if (message) {
            for (const character of world.getOnlineCharacters()) {
                writeToSocket(character.socket, message);
            }
        }
    });
}
