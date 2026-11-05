import assert from 'assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { writeJsonAtomic, readJsonFile } from '../modules/atomicWrite.js';

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'atomic-write-'));

try {
    // Round-trips, creates the parent directory, and leaves no temp file
    {
        const file = path.join(tempDir, 'nested', 'thing.json');
        writeJsonAtomic(file, { a: 1 });
        assert.deepStrictEqual(readJsonFile(file), { a: 1 });
        assert.equal(fs.existsSync(`${file}.tmp`), false);

        writeJsonAtomic(file, { a: 2 }); // replaces an existing file
        assert.deepStrictEqual(readJsonFile(file), { a: 2 });
    }

    // Missing and unparseable files both read as null
    {
        assert.equal(readJsonFile(path.join(tempDir, 'missing.json')), null);

        const corrupt = path.join(tempDir, 'corrupt.json');
        fs.writeFileSync(corrupt, '{"half');
        assert.equal(readJsonFile(corrupt), null);
    }
} finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
}

console.log('All tests passed');
