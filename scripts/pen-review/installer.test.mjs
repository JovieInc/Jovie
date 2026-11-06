import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
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
