import assert from 'assert/strict';
import { extractLines } from '../modules/utils.js';

// A single complete line, LF-terminated
{
    const { lines, remainder } = extractLines('', 'hello\n');
    assert.deepStrictEqual(lines, ['hello']);
    assert.equal(remainder, '');
}

// A single complete line, CRLF-terminated (classic telnet) - trim() strips
// the trailing \r
{
    const { lines, remainder } = extractLines('', 'hello\r\n');
    assert.deepStrictEqual(lines, ['hello']);
    assert.equal(remainder, '');
}

// A partial line with no newline yet must not be treated as complete -
// this is the exact bug: a client sending one keystroke per packet
// (Windows telnet.exe against a server with no Telnet negotiation) must
// not have each keystroke processed as its own command
{
    const { lines, remainder } = extractLines('', 'hel');
    assert.deepStrictEqual(lines, []);
    assert.equal(remainder, 'hel');
}

// Multiple lines arriving in one chunk
{
    const { lines, remainder } = extractLines('', 'foo\nbar\n');
    assert.deepStrictEqual(lines, ['foo', 'bar']);
    assert.equal(remainder, '');
}

// A blank line (user just pressing Enter) is preserved as an empty line,
// not dropped - the login flow depends on seeing blank input. "bar" here
// has no trailing \n yet, so it stays buffered rather than being emitted.
{
    const { lines, remainder } = extractLines('', 'foo\n\nbar');
    assert.deepStrictEqual(lines, ['foo', '']);
    assert.equal(remainder, 'bar');
}

// A line split across multiple chunks: nothing should be emitted until
// the newline actually arrives, and the previous remainder must be fed
// back in as the buffer on the next call
{
    const first = extractLines('', 'fo');
    assert.deepStrictEqual(first.lines, []);
    assert.equal(first.remainder, 'fo');

    const second = extractLines(first.remainder, 'o\n');
    assert.deepStrictEqual(second.lines, ['foo']);
    assert.equal(second.remainder, '');
}

// Character-at-a-time transmission (the real-world telnet.exe scenario):
// feeding one character at a time should emit nothing until Enter, then
// emit exactly one line with the accumulated word
{
    let buffer = '';
    const chunks = ['P', 'e', 'r', 's', 'i', 's', 't', 't', 'e', 's', 't', '\r', '\n'];
    const allLines = [];
    for (const chunk of chunks) {
        const { lines, remainder } = extractLines(buffer, chunk);
        allLines.push(...lines);
        buffer = remainder;
    }
    assert.deepStrictEqual(allLines, ['Persisttest']);
    assert.equal(buffer, '');
}

console.log('All tests passed');
