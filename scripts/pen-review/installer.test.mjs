import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const installer = fileURLToPath(
  new URL('../hostops/install-pen-review.sh', import.meta.url)
);
test('installer refuses absent Playwright before creating state or activating launchd', () => {
  const source = readFileSync(installer, 'utf8');
  assert.ok(
    source.indexOf(': "${PEN_REVIEW_PLAYWRIGHT:?') <
      source.indexOf('mkdir -p "$SHARE"')
  );
  const result = spawnSync('bash', [installer], {
    env: { ...process.env, PEN_REVIEW_PLAYWRIGHT: '', PEN_REVIEW_CHROMIUM: '' },
    encoding: 'utf8',
  });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Set PEN_REVIEW_PLAYWRIGHT/);
  assert.match(
    source,
    /printf -v BROWSER_ENV 'export PEN_REVIEW_PLAYWRIGHT=%q\\nexport PEN_REVIEW_CHROMIUM=%q'/
  );
  assert.match(source, /\$BROWSER_ENV\ngit -C/);
});

test('installer validates and carries absolute module and browser paths containing spaces', t => {
  const dir = mkdtempSync(join(tmpdir(), 'pen installer '));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  mkdirSync(join(dir, 'node_modules/playwright-core'), { recursive: true });
  writeFileSync(join(dir, 'package.json'), '{}');
  const browser = join(dir, 'fake chromium');
  writeFileSync(browser, '#!/bin/sh\nexit 0\n', { mode: 0o755 });
  writeFileSync(
    join(dir, 'node_modules/playwright-core/index.js'),
    `module.exports={chromium:{executablePath:()=>${JSON.stringify(browser)}}};`
  );
  const source = readFileSync(installer, 'utf8');
  // Execute only dependency validation and environment serialization, before
  // any checkout, state-directory, plist, or launchctl operations.
  const section = source.slice(
    source.indexOf('# The detached checkout'),
    source.indexOf('mkdir -p "$SHARE"')
  );
  const result = spawnSync(
    'bash',
    [
      '-c',
      `set -euo pipefail\n${section}\nunset PEN_REVIEW_PLAYWRIGHT PEN_REVIEW_CHROMIUM\neval "$BROWSER_ENV"\nprintf '%s\\n%s' "$PEN_REVIEW_PLAYWRIGHT" "$PEN_REVIEW_CHROMIUM"`,
    ],
    {
      cwd: dir,
      env: {
        ...process.env,
        PEN_REVIEW_PLAYWRIGHT: './package.json',
        PEN_REVIEW_CHROMIUM: '',
      },
      encoding: 'utf8',
    }
  );
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(result.stdout.split('\n'), [
    join(dir, 'package.json'),
    browser,
  ]);
});
