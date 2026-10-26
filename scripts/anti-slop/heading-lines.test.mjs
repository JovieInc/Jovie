import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import {
  checkTargets,
  linesFor,
  MAX_LINES,
  overLimit,
} from './heading-lines.mjs';

test('line counting from height and line-height', () => {
  assert.equal(MAX_LINES, 2);
  assert.equal(linesFor(52, 52), 1);
  assert.equal(linesFor(104, 52), 2);
  assert.equal(linesFor(156, 52), 3);
  assert.equal(linesFor(104.6, 52), 2);
  assert.equal(linesFor(0, 52), 0);
});

test('deliberate red: three lines is a violation, two is not', () => {
  const over = overLimit([{ lines: 2 }, { lines: 3 }, { lines: 1 }]);
  assert.equal(over.length, 1);
  assert.equal(over[0].lines, 3);
});

async function browserOrNull() {
  try {
    const { createRequire } = await import('node:module');
    const chromium = createRequire(
      new URL('../../apps/web/package.json', import.meta.url)
    )('playwright').chromium;
    const browser = await chromium.launch();
    await browser.close();
    return chromium;
  } catch {
    return null;
  }
}

test('real browser: a 3-line heading at 390 fails, a 2-line one passes', async t => {
  const chromium = await browserOrNull();
  if (!chromium) return t.skip('no chromium available');
  const dir = mkdtempSync(join(tmpdir(), 'heading-'));
  const bad = join(dir, 'bad.html');
  const good = join(dir, 'good.html');
  const style =
    '<style>body{margin:0;font:40px/48px sans-serif;width:100%}h1{margin:0}</style>';
  writeFileSync(
    bad,
    `${style}<h1>Claim the link that stays yours across every release show and fan platform you will ever use today</h1>`
  );
  writeFileSync(good, `${style}<h1>Claim your link</h1>`);
  const red = await checkTargets([bad], { browserType: chromium });
  assert.ok(
    red.failures.some(f => f.includes('@390')),
    red.failures.join('\n')
  );
  const green = await checkTargets([good], { browserType: chromium });
  assert.deepEqual(green.failures, []);
});
