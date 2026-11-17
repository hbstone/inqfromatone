// How much the AI tier (see claudeTier.js) has been used, from its call
// log: the `aiusage` report (see modules/commands/aiusage.js).
//
// The log is one file per month, in the server's local time:
// saves/<game>/logs/ai-2026-11.jsonl. A month's file is the "this month"
// total, and old months can be archived or deleted by hand.
//
// Tokens are exact, from the API's own counts. Cost is an estimate:
// tokens times PRICES, which need updating if prices change, and it only
// counts this game's calls. The Console is the real bill. The game can't
// see the Console's spend limit, so MUD_AI_MONTHLY_BUDGET (dollars) can be
// set to match it for a percentage.
import fs from 'fs';
import path from 'path';

// Dollars per million tokens (Nov 2026).
export const PRICES = {
    'claude-haiku-5-5': { input: 0.1, output: 0.5 },
    'claude-sonnet-5-5': { input: 2, output: 10 },
    'claude-opus-5-5': { input: 4, output: 20 },
};

// Outcomes where a request went to the API. The rest (cooldown, budget)
// were turned away before calling.
const CALLED = new Set(['answered', 'refused', 'cut off', 'unreadable', 'empty', 'error']);

// Shorter names for the fallback line.
const SHORT = { 'asker cooling down': 'cooldown', 'over the hourly budget': 'over budget' };

/**
 * The log file for the month `date` falls in.
 * @param {string} dir
 * @param {Date} [date]
 */
export function aiLogFile(dir, date = new Date()) {
    const month = String(date.getMonth() + 1).padStart(2, '0');
    return path.join(dir, `ai-${date.getFullYear()}-${month}.jsonl`);
}

/**
 * A log file's entries; none if it doesn't exist yet. Lines that aren't
 * JSON (a write cut short) are skipped.
 * @param {string} file
 * @returns {object[]}
 */
export function readAiLog(file) {
    let text;
    try {
        text = fs.readFileSync(file, 'utf8');
    } catch (err) {
        if (err.code === 'ENOENT') {
            return [];
        }
        throw err;
    }
    return text
        .split('\n')
        .filter((line) => line.trim())
        .flatMap((line) => {
            try {
                return [JSON.parse(line)];
            } catch {
                return [];
            }
        });
}

/**
 * Totals for some log entries.
 * @param {object[]} entries
 * @returns {{ calls: number, input: number, output: number, cost: number, unpriced: string[], fallbacks: object }}
 */
export function summarize(entries) {
    const totals = { calls: 0, input: 0, output: 0, cost: 0, unpriced: [], fallbacks: {} };
    for (const entry of entries) {
        if (CALLED.has(entry.outcome)) {
            totals.calls += 1;
        }
        if (entry.outcome !== 'answered') {
            totals.fallbacks[entry.outcome] = (totals.fallbacks[entry.outcome] ?? 0) + 1;
        }
        const input = entry.usage?.input ?? 0;
        const output = entry.usage?.output ?? 0;
        totals.input += input;
        totals.output += output;
        const price = PRICES[entry.model];
        if (price) {
            totals.cost += (input * price.input + output * price.output) / 1e6;
        } else if ((input || output) && !totals.unpriced.includes(entry.model)) {
            totals.unpriced.push(entry.model);
        }
    }
    return totals;
}

function tokens(n) {
    if (n < 1000) {
        return String(n);
    }
    if (n < 1e6) {
        return `${(n / 1000).toFixed(n < 10_000 ? 1 : 0)}K`;
    }
    return `${(n / 1e6).toFixed(1)}M`;
}

// "about $0.42", or "under $0.01" for a sliver.
function dollars(n) {
    return n > 0 && n < 0.01 ? 'under $0.01' : `about $${n.toFixed(2)}`;
}

function totalsLine(totals, budget) {
    const calls = `${totals.calls.toLocaleString('en-US')} call${totals.calls === 1 ? '' : 's'}`;
    const spend = `${dollars(totals.cost)}${budget ? ` of $${budget} (${Math.round((totals.cost / budget) * 100)}%)` : ''}`;
    const unpriced = totals.unpriced.length ? ` (no price for ${totals.unpriced.join(', ')})` : '';
    return `${calls}, ${tokens(totals.input)} tokens in / ${tokens(totals.output)} out, ${spend}${unpriced}`;
}

/**
 * The `aiusage` report.
 * @param {object} options
 * @param {object[]} options.entries - This month's log.
 * @param {{ model: string, callsLastHour: number, callsPerHour: number, disabled: boolean }|null} options.status -
 *   The running tier's, or null if it's off.
 * @param {number|null} [options.budget] - Dollars a month (MUD_AI_MONTHLY_BUDGET).
 * @param {Date} [options.now]
 * @returns {string}
 */
export function usageReport({ entries, status, budget = null, now = new Date() }) {
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const today = summarize(entries.filter((entry) => Date.parse(entry.at) >= startOfDay));
    const month = summarize(entries);

    const lines = [status ? `AI usage (${status.model})` : 'AI usage (the AI tier is off: no MUD_ANTHROPIC_API_KEY)'];
    if (status?.disabled) {
        lines.push('  Last hour:  switched off, the API key was rejected');
    } else if (status) {
        lines.push(`  Last hour:  ${status.callsLastHour} of ${status.callsPerHour} calls allowed`);
    }
    lines.push(`  Today:      ${totalsLine(today, null)}`);
    lines.push(`  This month: ${totalsLine(month, budget)}`);
    const fallbacks = Object.entries(today.fallbacks).map(([outcome, n]) => `${n} ${SHORT[outcome] ?? outcome}`);
    lines.push(`  Fallbacks today: ${fallbacks.length ? fallbacks.join(', ') : 'none'}`);
    return lines.join('\n');
}
