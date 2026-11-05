import assert from 'assert/strict';
import crypto from 'crypto';
import { hashPassword, verifyPassword } from '../modules/auth.js';

// Self-describing scrypt format, salted (same password, different hashes)
{
    const a = hashPassword('hunter2');
    const b = hashPassword('hunter2');
    assert.match(a, /^scrypt\$16384\$8\$1\$[0-9a-f]{32}\$[0-9a-f]{128}$/);
    assert.notEqual(a, b, 'each hash should get its own salt');
}

// Round-trips; wrong passwords fail
{
    const stored = hashPassword('hunter2');
    assert.deepStrictEqual(verifyPassword('hunter2', stored), { ok: true, needsRehash: false });
    assert.deepStrictEqual(verifyPassword('hunter3', stored), { ok: false, needsRehash: false });
}

// Legacy unsalted SHA-256 still verifies, flagged for rehash
{
    const legacy = crypto.createHash('sha256').update('hunter2').digest('hex');
    assert.deepStrictEqual(verifyPassword('hunter2', legacy), { ok: true, needsRehash: true });
    assert.deepStrictEqual(verifyPassword('wrong', legacy), { ok: false, needsRehash: false });
}

// Weaker-than-current scrypt parameters verify, flagged for rehash
{
    const salt = crypto.randomBytes(16);
    const hash = crypto.scryptSync('hunter2', salt, 64, { N: 1024, r: 8, p: 1 });
    const weak = ['scrypt', 1024, 8, 1, salt.toString('hex'), hash.toString('hex')].join('$');
    assert.deepStrictEqual(verifyPassword('hunter2', weak), { ok: true, needsRehash: true });
}

// Missing or malformed stored values never verify
{
    for (const stored of [undefined, null, '', 'plaintext', 'scrypt$16384$8$1$00$', 'scrypt$abc$8$1$00$00', 'bcrypt$1$2$3$4$5']) {
        assert.equal(verifyPassword('anything', stored).ok, false, `should reject ${JSON.stringify(stored)}`);
    }
    // An empty hash field must not "match" an empty candidate
    assert.equal(verifyPassword('', 'scrypt$16384$8$1$00$').ok, false);
}

console.log('All tests passed');
