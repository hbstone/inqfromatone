import assert from 'assert/strict';
import { stripTelnetNegotiation } from '../modules/utils.js';

// Plain text with no negotiation bytes passes through unchanged
{
    const result = stripTelnetNegotiation(Buffer.from('hello\n'));
    assert.equal(result.toString(), 'hello\n');
}

// A single WILL/WONT/DO/DONT negotiation (IAC + command + option, 3 bytes)
// is stripped, real text around it survives
{
    // IAC WILL ECHO (0xFF 0xFB 0x01), then the user's actual input
    const data = Buffer.concat([
        Buffer.from([0xff, 0xfb, 0x01]),
        Buffer.from('Rhaehan\r\n'),
    ]);
    assert.equal(stripTelnetNegotiation(data).toString(), 'Rhaehan\r\n');
}

// Multiple negotiations back-to-back (the realistic PuTTY-on-connect case)
{
    const data = Buffer.concat([
        Buffer.from([0xff, 0xfb, 0x18]), // IAC WILL TERMINAL-TYPE
        Buffer.from([0xff, 0xfb, 0x1f]), // IAC WILL NAWS
        Buffer.from([0xff, 0xfd, 0x01]), // IAC DO ECHO
        Buffer.from('Rhaehan\r\n'),
    ]);
    assert.equal(stripTelnetNegotiation(data).toString(), 'Rhaehan\r\n');
}

// A subnegotiation block (IAC SB ... IAC SE) is skipped as a whole, e.g. a
// NAWS window-size report sent mid-session on a terminal resize
{
    const data = Buffer.concat([
        Buffer.from('before'),
        Buffer.from([0xff, 0xfa, 0x1f, 0x00, 0x50, 0x00, 0x18, 0xff, 0xf0]), // IAC SB NAWS <w><h> IAC SE
        Buffer.from('after\n'),
    ]);
    assert.equal(stripTelnetNegotiation(data).toString(), 'beforeafter\n');
}

// IAC IAC is an escaped literal 0xFF byte, not a command - it should
// survive as a single 0xFF, not be stripped
{
    const data = Buffer.from([0xff, 0xff]);
    const result = stripTelnetNegotiation(data);
    assert.deepStrictEqual([...result], [0xff]);
}

// A truncated IAC at the very end of a chunk (no command byte yet) doesn't
// throw or hang - it's just dropped
{
    const data = Buffer.concat([Buffer.from('hi'), Buffer.from([0xff])]);
    assert.doesNotThrow(() => stripTelnetNegotiation(data));
}

console.log('All tests passed');
