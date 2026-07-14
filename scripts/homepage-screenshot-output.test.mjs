import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

const producers = [
  'test-homepage.mjs',
  'test-homepage.cjs',
  'apps/web/test-homepage-playwright.js',
];
const outputPath = 'test-results/homepage/homepage-test-screenshot.png';

test('homepage screenshot producers replace one ignored owned artifact', () => {
  for (const producer of producers) {
    const source = readFileSync(resolve(producer), 'utf8');
    assert.match(
      source,
      /test-results\/homepage\/homepage-test-screenshot\.png/
    );
    assert.match(
      source,
      /await mkdir\(dirname\(screenshotPath\), \{ recursive: true \}\)/
    );
    assert.doesNotMatch(source, /Documents\/GitHub\/TBF\/Jovie/);
  }

  assert.equal(existsSync(resolve('homepage-test-screenshot.png')), false);
  const ignoredPath = execFileSync('git', ['check-ignore', outputPath], {
    encoding: 'utf8',
  }).trim();
  assert.equal(ignoredPath, outputPath);
});
