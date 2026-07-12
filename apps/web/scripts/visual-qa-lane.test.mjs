import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const webRoot = join(dirname(fileURLToPath(import.meta.url)), '..');

function listVisualQaTests(testFile) {
  return execFileSync(
    'pnpm',
    [
      'exec',
      'playwright',
      'test',
      testFile,
      '--config=playwright.config.visual-qa.ts',
      '--list',
    ],
    {
      cwd: webRoot,
      encoding: 'utf8',
      env: {
        ...process.env,
        BASE_URL: 'http://127.0.0.1:3100',
      },
    }
  );
}

test('visual breakpoint command selects exactly its executable check', () => {
  const output = listVisualQaTests('tests/visual-qa/breakpoint-check.spec.ts');

  assert.match(output, /breakpoint-check\.spec\.ts/);
  assert.doesNotMatch(output, /capture\.spec\.ts/);
  assert.match(output, /Total: 1 test in 1 file/);
});
