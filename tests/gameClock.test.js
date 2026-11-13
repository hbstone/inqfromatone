import assert from 'assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { World } from '../modules/World.js';
import { on } from '../modules/events.js';
import { advance, reset } from '../modules/scheduler.js';
import { loadTimeSettings, getGameTime, startGameClock } from '../modules/gameClock.js';
import { time, formatClock } from '../modules/commands/time.js';

const EPOCH = Date.parse('2026-01-01T00:00:00Z');
const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'clock-'));
function settings(obj) {
    const file = path.join(dir, `time-${Math.random()}.json`);
    fs.writeFileSync(file, JSON.stringify(obj));
    return file;
}

try {
    // Speed 1: game time tracks real time from the epoch, day 1 first
    loadTimeSettings(settings({ speed: 1, phases: [] }));
    assert.deepEqual(getGameTime(EPOCH), { day: 1, hour: 0, minute: 0, phase: null });
    assert.deepEqual(getGameTime(EPOCH + 25 * HOUR + 30 * MINUTE), { day: 2, hour: 1, minute: 30, phase: null });

    // Speed 4: a real hour is four game hours
    loadTimeSettings(settings({ speed: 4, phases: [] }));
    assert.equal(getGameTime(EPOCH + HOUR).hour, 4);
    assert.equal(getGameTime(EPOCH + 6 * HOUR).day, 2, 'a game day every six real hours');

    // Phases: latest one started; before the first, the last carries over
    // from the previous day. Listed out of order on purpose - they're sorted.
    loadTimeSettings(
        settings({
            speed: 1,
            phases: [
                { name: 'night', startHour: 20, message: 'Night falls.' },
                { name: 'day', startHour: 6, message: 'The sun rises.' },
            ],
        }),
    );
    assert.equal(getGameTime(EPOCH + 3 * HOUR).phase, 'night', 'early morning is still night');
    assert.equal(getGameTime(EPOCH + 6 * HOUR).phase, 'day');
    assert.equal(getGameTime(EPOCH + 21 * HOUR).phase, 'night');

    // Bad settings fail loudly at load
    assert.throws(() => loadTimeSettings(settings({ speed: 0 })), /positive "speed"/);
    assert.throws(() => loadTimeSettings(settings({ speed: 1, phases: [{ name: 'x', startHour: 24 }] })), /startHour/);

    // The clock emits hourChange every hour, phaseChange (plus the phase's
    // message to everyone online) only when the phase actually changes
    {
        loadTimeSettings(
            settings({
                speed: 1,
                phases: [
                    { name: 'night', startHour: 20, message: 'Night falls.' },
                    { name: 'day', startHour: 6, message: 'The sun rises.' },
                ],
            }),
        );
        reset();

        const world = new World();
        const room = world.getRoomById(world.addRoom('Room', 'A room'));
        const socket = { messages: [], write: (m) => socket.messages.push(m) };
        room.addCharacter({ name: 'Watcher', socket, keywords: ['watcher'] });
        const inside = world.getRoomById(world.addRoom('Cellar', 'A cellar'));
        inside.indoors = true;
        const insideSocket = { messages: [], write: (m) => insideSocket.messages.push(m) };
        inside.addCharacter({ name: 'Lurker', socket: insideSocket, keywords: ['lurker'] });

        const hours = [];
        const phaseChanges = [];
        on('hourChange', ({ time }) => hours.push(time.hour));
        on('phaseChange', ({ from, to }) => phaseChanges.push(`${from}->${to}`));

        let now = EPOCH + 4 * HOUR + 59 * MINUTE; // 04:59, night
        startGameClock(world, () => now);

        now += MINUTE; // 05:00
        advance(1000);
        now += HOUR; // 06:00, day begins
        advance(1000);
        advance(1000); // same hour, nothing new

        assert.deepEqual(hours, [5, 6]);
        assert.deepEqual(insideSocket.messages, [], 'phase messages skip indoor rooms');
        assert.deepEqual(phaseChanges, ['night->day']);
        assert.equal(socket.messages.filter((m) => m.includes('The sun rises.')).length, 1);
        assert.ok(!socket.messages.some((m) => m.includes('Night falls.')));
    }

    // 12-hour clock, including the midnight/noon edges
    assert.equal(formatClock(0, 5), '12:05am');
    assert.equal(formatClock(5, 26), '5:26am');
    assert.equal(formatClock(11, 59), '11:59am');
    assert.equal(formatClock(12, 0), '12:00pm');
    assert.equal(formatClock(17, 26), '5:26pm');
    assert.equal(formatClock(23, 9), '11:09pm');

    // `time` reports the clock, with the phase when there is one, and no day
    {
        loadTimeSettings(settings({ speed: 1, phases: [{ name: 'day', startHour: 0 }] }));
        assert.match(time(), /^It is \d{1,2}:\d\d[ap]m \(day\)\.$/);
        loadTimeSettings(settings({ speed: 1, phases: [] }));
        assert.match(time(), /^It is \d{1,2}:\d\d[ap]m\.$/);
    }

    // The real content file loads
    loadTimeSettings();
} finally {
    reset();
    fs.rmSync(dir, { recursive: true, force: true });
}

console.log('All tests passed');
