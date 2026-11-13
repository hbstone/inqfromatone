// Password hashing. scrypt (Node built-in, no dependency) with a random
// per-password salt - deliberately slow and memory-hard, unlike the plain
// unsalted SHA-256 this replaced, which a stolen save file could be
// brute-forced or rainbow-tabled against cheaply.
//
// Stored format is self-describing - `scrypt$N$r$p$salt$hash`, hex-encoded
// - so the cost parameters can be raised later without breaking existing
// saves: verifyPassword reads them from the stored string and reports
// needsRehash when they're below the current defaults.
//
// Uses scryptSync: login is the only caller, a hash takes tens of
// milliseconds, and the command pipeline is synchronous end to end. Worth
// revisiting (async scrypt + an async login path) if login volume ever
// makes that pause noticeable for everyone else.
import crypto from 'crypto';

const N = 16384; // CPU/memory cost (Node's default); ~16 MB per hash with r=8
const R = 8;
const P = 1;
const KEY_LENGTH = 64;
const SALT_BYTES = 16;

// Pre-scrypt saves: bare hex SHA-256 of the password, no salt.
const LEGACY_SHA256 = /^[0-9a-f]{64}$/;

/**
 * Hash a password for storage.
 * @param {string} password
 * @returns {string} `scrypt$N$r$p$salt$hash`
 */
export function hashPassword(password) {
    const salt = crypto.randomBytes(SALT_BYTES);
    const hash = crypto.scryptSync(password, salt, KEY_LENGTH, { N, r: R, p: P });
    return ['scrypt', N, R, P, salt.toString('hex'), hash.toString('hex')].join('$');
}

/**
 * Check a password against a stored hash (either format).
 * @param {string} password
 * @param {string} stored
 * @returns {{ ok: boolean, needsRehash: boolean }} needsRehash is true
 *   when the password matched but the stored hash is legacy SHA-256 or
 *   uses weaker-than-current scrypt parameters - the caller should save
 *   a fresh hashPassword(password) in its place.
 */
export function verifyPassword(password, stored) {
    if (typeof stored !== 'string') {
        return { ok: false, needsRehash: false };
    }

    if (LEGACY_SHA256.test(stored)) {
        const candidate = crypto.createHash('sha256').update(password).digest();
        const ok = safeEqual(candidate, Buffer.from(stored, 'hex'));
        return { ok, needsRehash: ok };
    }

    const parts = stored.split('$');
    if (parts.length !== 6 || parts[0] !== 'scrypt') {
        return { ok: false, needsRehash: false };
    }
    const [, n, r, p, saltHex, hashHex] = parts;
    const params = { N: Number(n), r: Number(r), p: Number(p) };
    const expected = Buffer.from(hashHex, 'hex');
    if (expected.length === 0) {
        return { ok: false, needsRehash: false }; // empty would "match" an empty candidate
    }

    let candidate;
    try {
        candidate = crypto.scryptSync(password, Buffer.from(saltHex, 'hex'), expected.length, params);
    } catch {
        return { ok: false, needsRehash: false }; // malformed parameters in the stored string
    }

    const ok = safeEqual(candidate, expected);
    const weaker = params.N < N || params.r < R || params.p < P || expected.length < KEY_LENGTH;
    return { ok, needsRehash: ok && weaker };
}

// Constant-time comparison, so response timing doesn't leak how much of a
// guess matched.
function safeEqual(a, b) {
    return a.length === b.length && crypto.timingSafeEqual(a, b);
}
