import assert from 'assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { aiLogFile, readAiLog, summarize, usageReport } from '../modules/npcs/aiUsage.js';

const NOW = new Date(2026, 10, 16, 15, 0); // Nov 16, 3pm local
const at = (day, hour = 12) => new Date(2026, 10, day, hour).toISOString();
const call = (day, outcome = 'answered', input = 1000, output = 80, model = 'claude-haiku-5-5') => ({
    at: at(day),
    model,
    outcome,
    usage: { input, output },
});
const turnedAway = (day, outcome) => ({ at: at(day), model: 'claude-haiku-5-5', outcome });

// Files are named by local month
{
    assert.equal(path.basename(aiLogFile('logs', NOW)), 'ai-2026-11.jsonl');
    assert.equal(path.basename(aiLogFile('logs', new Date(2027, 0, 1))), 'ai-2027-01.jsonl');
}

// Totals: calls that reached the API, tokens, estimated cost; anything but
// an answer counts as a fallback, turned away or not
{
    const totals = summarize([
        call(16),
        call(16, 'refused', 900, 10),
        turnedAway(16, 'asker cooling down'),
        call(16, 'answered', 1_000_000, 100_000, 'claude-opus-5-5'),
        call(16, 'answered', 50, 5, 'some-new-model'),
    ]);
    assert.equal(totals.calls, 4);
    assert.equal(totals.input, 1_001_950);
    assert.equal(totals.output, 100_095);
    assert.ok(Math.abs(totals.cost - (6 + (1900 * 0.1 + 90 * 0.5) / 1e6)) < 1e-9);
    assert.deepEqual(totals.unpriced, ['some-new-model']);
    assert.deepEqual(totals.fallbacks, { refused: 1, 'asker cooling down': 1 });
}

// The report: last hour from the running tier; today and this month from
// the log; fallbacks today with short names
{
    const entries = [
        ...Array.from({ length: 3000 }, () => call(2)),
        call(16),
        call(16),
        turnedAway(16, 'asker cooling down'),
        turnedAway(16, 'over the hourly budget'),
        call(16, 'refused', 900, 10),
    ];
    const status = { model: 'claude-haiku-5-5', callsLastHour: 14, callsPerHour: 120, disabled: false };
    assert.equal(
        usageReport({ entries, status, budget: 5, now: NOW }),
        [
            'AI usage (claude-haiku-5-5)',
            '  Last hour:  14 of 120 calls allowed',
            '  Today:      3 calls, 2.9K tokens in / 170 out, under $0.01',
            '  This month: 3,003 calls, 3.0M tokens in / 240K out, about $0.42 of $5 (8%)',
            '  Fallbacks today: 1 cooldown, 1 over budget, 1 refused',
        ].join('\n'),
    );
}

// Off, or switched off by a rejected key; an empty log
{
    assert.equal(
        usageReport({ entries: [], status: null, now: NOW }),
        [
            'AI usage (the AI tier is off: no MUD_ANTHROPIC_API_KEY)',
            '  Today:      0 calls, 0 tokens in / 0 out, about $0.00',
            '  This month: 0 calls, 0 tokens in / 0 out, about $0.00',
            '  Fallbacks today: none',
        ].join('\n'),
    );
    const status = { model: 'claude-haiku-5-5', callsLastHour: 0, callsPerHour: 120, disabled: true };
    assert.match(
        usageReport({ entries: [], status, now: NOW }),
        /Last hour: {2}switched off, the API key was rejected/,
    );
}

// A missing file is an empty log; a half-written line is skipped
{
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-usage-'));
    const file = path.join(dir, 'ai-2026-11.jsonl');
    assert.deepEqual(readAiLog(file), []);
    fs.writeFileSync(file, `${JSON.stringify(call(16))}\n{"at":"2026-11\n`);
    assert.equal(readAiLog(file).length, 1);
    fs.rmSync(dir, { recursive: true, force: true });
}
