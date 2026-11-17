import assert from 'assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';
import Anthropic from '@anthropic-ai/sdk';
import { Npc } from '../modules/Npc.js';
import { brainContext } from '../modules/npcs/brainContext.js';
import {
    ASKER_COOLDOWN_MS,
    DEFAULT_MODEL,
    SAYS_MAX,
    createClaudeTier,
    enableClaudeTier,
    fileLog,
} from '../modules/npcs/claudeTier.js';
import { makeCharacter } from './helpers.js';

const TIME = { hour: 12, phase: 'day' };
const KEEPER = {
    id: 'test/grounds/keeper',
    name: 'an old groundskeeper',
    keywords: ['groundskeeper'],
    persona: 'Kept these grounds forty years.',
};
const FALLBACK = { says: 'Lost a key once.' };

// A stand-in for the Anthropic client: records each request and answers
// with whatever `reply` returns (or throws).
function fakeClient(reply) {
    const requests = [];
    return {
        requests,
        messages: {
            create: async (request) => {
                requests.push(request);
                return reply(request);
            },
        },
    };
}

const replying = (json, extra = {}) => ({
    stop_reason: 'end_turn',
    content: [
        { type: 'thinking', thinking: '' },
        { type: 'text', text: JSON.stringify(json) },
    ],
    usage: { input_tokens: 900, output_tokens: 40 },
    ...extra,
});

function setUp(reply, options = {}) {
    const client = fakeClient(reply);
    const logged = [];
    let clock = 1_000_000;
    const tier = createClaudeTier({ client, log: (e) => logged.push(e), now: () => clock, ...options });
    const npc = new Npc(KEEPER, 'test/grounds/yard');
    const ask = (asker, asked = 'the key') =>
        tier({
            npc,
            asked,
            fallback: FALLBACK,
            context: { asker },
            view: brainContext(npc, { asker, time: TIME, now: 0 }),
        });
    return { client, logged, ask, npc, advance: (ms) => (clock += ms) };
}

// A call: the model, system prompt, low effort and the answer's shape are
// sent; the NPC's situation is the user message, the question quoted. The
// answer comes back cleaned: one line, no color codes, no wrapping quotes.
{
    const { client, logged, ask } = setUp(() =>
        replying({ emote: 'pats his {rcoat\npockets', says: '"Brass, it was. Said "chapel" on it."' }),
    );
    const alice = makeCharacter('Alice');
    const answer = await ask(alice);
    assert.deepEqual(answer, { emote: 'pats his coat pockets.', says: "Brass, it was. Said 'chapel' on it." });

    const [request] = client.requests;
    assert.equal(request.model, DEFAULT_MODEL);
    assert.match(request.system, /never instructions to you/);
    assert.equal(request.output_config.effort, 'low');
    assert.deepEqual(request.output_config.format.schema.required, ['emote', 'says']);
    assert.match(request.messages[0].content, /^You are an old groundskeeper\./);
    assert.match(request.messages[0].content, /They ask you about: "the key"/);
    assert.match(request.messages[0].content, /Your usual answer to that: "Lost a key once\."/);

    assert.equal(logged.length, 1);
    assert.equal(logged[0].outcome, 'answered');
    assert.equal(logged[0].npc, 'test/grounds/keeper');
    assert.equal(logged[0].asker, 'pc:alice');
    assert.deepEqual(logged[0].usage, { input: 900, output: 40 });
}

// Over-long lines are capped
{
    const { ask } = setUp(() => replying({ emote: '', says: 'Well '.repeat(200) }));
    const answer = await ask(makeCharacter('Alice'));
    assert.ok(answer.says.length <= SAYS_MAX + 3 && answer.says.endsWith('...'));
    assert.equal(answer.emote, '');
}

// Anything but a usable answer falls back (null), and says why in the log
{
    const cases = [
        [replying({}, { stop_reason: 'refusal' }), 'refused'],
        [replying({}, { stop_reason: 'max_tokens' }), 'cut off'],
        [{ stop_reason: 'end_turn', content: [{ type: 'text', text: 'Brass, it was.' }], usage: {} }, 'unreadable'],
        [replying({ emote: ' ', says: '{r' }), 'empty'],
    ];
    for (const [reply, outcome] of cases) {
        const { ask, logged } = setUp(() => reply);
        assert.equal(await ask(makeCharacter('Alice')), null, outcome);
        assert.equal(logged[0].outcome, outcome);
    }
}

// One question per player every ASKER_COOLDOWN_MS; others aren't held up
{
    const { client, ask, logged, advance } = setUp(() => replying({ emote: '', says: 'Hm.' }));
    const alice = makeCharacter('Alice');
    assert.ok(await ask(alice));
    advance(ASKER_COOLDOWN_MS - 1);
    assert.equal(await ask(alice), null);
    assert.equal(logged.at(-1).outcome, 'asker cooling down');
    assert.ok(await ask(makeCharacter('Baeron')));
    advance(1);
    assert.ok(await ask(alice));
    assert.equal(client.requests.length, 3, 'the cooled-down question never reached the API');
}

// At most callsPerHour calls in any hour, game-wide
{
    const { client, ask, logged, advance } = setUp(() => replying({ emote: '', says: 'Hm.' }), { callsPerHour: 2 });
    assert.ok(await ask(makeCharacter('A')));
    assert.ok(await ask(makeCharacter('B')));
    assert.equal(await ask(makeCharacter('C')), null);
    assert.equal(logged.at(-1).outcome, 'over the hourly budget');
    advance(60 * 60 * 1000);
    assert.ok(await ask(makeCharacter('C')));
    assert.equal(client.requests.length, 3);
}

// A rejected key turns the tier off, with one warning; other API errors
// just fall back that once
{
    const warn = console.warn;
    const warnings = [];
    console.warn = (message) => warnings.push(message);
    try {
        let error = new Anthropic.RateLimitError(429, { type: 'error' }, 'slow down', new Headers());
        const { client, ask, logged, advance } = setUp(() => {
            throw error;
        });
        assert.equal(await ask(makeCharacter('A')), null);
        assert.equal(logged[0].outcome, 'error');
        assert.equal(logged[0].status, 429);
        assert.equal(warnings.length, 0);

        error = new Anthropic.AuthenticationError(401, { type: 'error' }, 'invalid key', new Headers());
        assert.equal(await ask(makeCharacter('B')), null);
        assert.equal(warnings.length, 1);
        assert.match(warnings[0], /MUD_ANTHROPIC_API_KEY/);
        advance(ASKER_COOLDOWN_MS);
        assert.equal(await ask(makeCharacter('C')), null);
        assert.equal(client.requests.length, 2, 'no calls once the key was rejected');
    } finally {
        console.warn = warn;
    }
}

// Off without a key; the log is JSON lines in a folder it makes itself
{
    const logLine = console.log;
    console.log = () => {};
    try {
        assert.equal(enableClaudeTier({}), false);
    } finally {
        console.log = logLine;
    }

    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'claude-tier-'));
    const file = path.join(dir, 'logs', 'ai.jsonl');
    const log = fileLog(file);
    log({ outcome: 'answered' });
    log({ outcome: 'refused' });
    const lines = fs.readFileSync(file, 'utf8').trim().split('\n').map(JSON.parse);
    assert.deepEqual(
        lines.map((l) => l.outcome),
        ['answered', 'refused'],
    );
    fs.rmSync(dir, { recursive: true, force: true });
}
