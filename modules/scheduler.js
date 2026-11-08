// The engine's one source of "later" (see ARCHITECTURE.md's Scheduler
// section). Everything that runs on a timer - regen, the world-save
// checkpoint, combat auto-attacks, the game clock, and whatever theme
// packs add - registers a job here instead of calling setInterval/
// setTimeout itself.
//
// Why one scheduler instead of scattered timers:
//   - one place that knows every recurring thing the game does;
//   - every job is guarded (modules/guard.js), so a theme pack's broken
//     job is logged instead of crashing the process;
//   - time only moves when advance() is called, so tests step it forward
//     directly instead of mocking Node's timers;
//   - a later pause/"time stop" or a debug `jobs` listing has one place
//     to live.
//
// Scheduler time is "how long the engine has been running", not wall-clock
// time. That's what jobs like "every 2 seconds" or "in 5 minutes" mean.
// The in-game time of day is a separate thing, derived from the wall clock
// (see modules/gameClock.js).
import { guard } from "./guard.js";

// How often the real-time driver (start()) wakes up to advance time.
// Jobs still run in exact due-time order inside each advance, so this only
// limits how late a job can be (at most one pulse), not their ordering.
const PULSE_MS = 250;

// The most time a single wake-up will advance. If the process stalls (a
// laptop sleeping, a debugger pause), jobs pause with it instead of firing
// every missed run back to back when it wakes - e.g. a ten-minute sleep
// shouldn't deliver twenty regen ticks in one burst.
const MAX_CATCH_UP_MS = 1000;

let elapsed = 0;
const jobs = new Set();

function addJob(label, delayMs, fn, repeatMs) {
    if (!(delayMs > 0)) {
        throw new Error(`Scheduler job "${label}" needs a positive delay, got ${delayMs}.`);
    }
    const job = {
        label,
        fn,
        repeatMs,
        dueAt: elapsed + delayMs,
        cancel: () => jobs.delete(job),
    };
    jobs.add(job);
    return job;
}

/**
 * Run fn every intervalMs (first run one interval from now).
 * @param {string} label - What this is, for error logs.
 * @param {number} intervalMs
 * @param {() => void} fn
 * @returns {{ cancel: () => void }}
 */
export function every(label, intervalMs, fn) {
    return addJob(label, intervalMs, fn, intervalMs);
}

/**
 * Run fn once, delayMs from now.
 * @param {string} label - What this is, for error logs.
 * @param {number} delayMs
 * @param {() => void} fn
 * @returns {{ cancel: () => void }}
 */
export function after(label, delayMs, fn) {
    return addJob(label, delayMs, fn, null);
}

function nextDue(until) {
    let next = null;
    for (const job of jobs) {
        if (job.dueAt <= until && (!next || job.dueAt < next.dueAt)) {
            next = job;
        }
    }
    return next;
}

/**
 * Move scheduler time forward by ms, running every job that comes due
 * along the way, in due-time order. A repeating job that comes due more
 * than once in the span runs once per interval. Jobs added or cancelled
 * by other jobs mid-advance take effect immediately.
 * @param {number} ms
 */
export function advance(ms) {
    const until = elapsed + ms;
    for (let job = nextDue(until); job; job = nextDue(until)) {
        elapsed = job.dueAt;
        if (job.repeatMs) {
            job.dueAt += job.repeatMs;
        } else {
            jobs.delete(job);
        }
        guard(job.label, job.fn);
    }
    elapsed = until;
}

/**
 * Start advancing with real time. Called once from game.js.
 * @returns {NodeJS.Timeout} The driving interval (e.g. to stop it).
 */
export function start() {
    let last = Date.now();
    return setInterval(() => {
        const now = Date.now();
        // Clamped at 0 too, in case the system clock is set backwards.
        const delta = Math.max(0, Math.min(now - last, MAX_CATCH_UP_MS));
        last = now;
        advance(delta);
    }, PULSE_MS);
}

/**
 * Drop every job and reset time to zero. For tests.
 */
export function reset() {
    jobs.clear();
    elapsed = 0;
}
