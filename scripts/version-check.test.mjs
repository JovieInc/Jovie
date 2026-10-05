import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, '..');

test('version-check audit passes on the stamped tree', () => {
  const output = execFileSync(
    process.execPath,
    [join(__dirname, 'version-check.mjs')],
    { cwd: REPO_ROOT, encoding: 'utf-8' }
  );
  assert.match(output, /Versioning audit passed\./);
});
