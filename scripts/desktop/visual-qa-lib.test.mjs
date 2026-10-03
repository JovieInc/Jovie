import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  APP_TARGETS,
  buildRouteDeepLink,
  captureName,
  classifyCapture,
  DEFAULT_SIZES,
  diffRgba,
  findingsFrom,
  parseHidIdleSeconds,
  renderMarkdownReport,
} from './visual-qa-lib.mjs';

const here = dirname(fileURLToPath(import.meta.url));

function solid(width, height, [r, g, b]) {
  const buffer = Buffer.alloc(width * height * 4);
  for (let i = 0; i < buffer.length; i += 4) {
    buffer[i] = r;
    buffer[i + 1] = g;
    buffer[i + 2] = b;
    buffer[i + 3] = 255;
  }
  return buffer;
}

test('deep links target the auth-return route loader with an encoded app path', () => {
  assert.equal(
    buildRouteDeepLink('jovie-staging', '/app/ov/people?tab=users'),
    'jovie-staging://auth-return?route=%2Fapp%2Fov%2Fpeople%3Ftab%3Dusers'
  );
});

test('deep links refuse anything but an absolute same-origin path', () => {
  for (const route of [
    'https://evil.test',
    '//evil.test/app',
    'app',
    undefined,
  ]) {
    assert.throws(() => buildRouteDeepLink('jovie', route));
  }
});

test('idle time parses ioreg nanoseconds and tolerates missing output', () => {
  assert.equal(parseHidIdleSeconds('    "HIDIdleTime" = 305123456789'), 305);
  assert.equal(parseHidIdleSeconds('nothing here'), null);
});

test('capture names are stable per route and size', () => {
  assert.equal(
    captureName('/app/ov/revenue-lift', DEFAULT_SIZES[1]),
    'app-ov-revenue-lift--narrow.png'
  );
  assert.equal(captureName('/', DEFAULT_SIZES[0]), 'root--default.png');
});

test('diff ignores anti-aliasing noise and boxes real changes', () => {
  const width = 10;
  const height = 10;
  const base = solid(width, height, [20, 20, 20]);
  const noisy = solid(width, height, [30, 30, 30]);
  assert.deepEqual(diffRgba(base, noisy, { width, height }), {
    changedRatio: 0,
    box: null,
  });

  const moved = Buffer.from(base);
  for (const [x, y] of [
    [2, 3],
    [5, 7],
  ]) {
    moved[(y * width + x) * 4] = 255;
  }
  assert.deepEqual(diffRgba(base, moved, { width, height }), {
    changedRatio: 0.02,
    box: { x: 2, y: 3, width: 4, height: 5 },
  });
});

test('diff rejects mismatched buffers instead of comparing garbage', () => {
  assert.throws(() =>
    diffRgba(Buffer.alloc(4), Buffer.alloc(8), { width: 1, height: 1 })
  );
});

test('classification separates first runs, resizes, and threshold breaches', () => {
  assert.equal(
    classifyCapture({ baseline: false, diff: null, threshold: 0.02 }),
    'new'
  );
  assert.equal(
    classifyCapture({ baseline: true, diff: null, threshold: 0.02 }),
    'resized'
  );
  assert.equal(
    classifyCapture({
      baseline: true,
      diff: { changedRatio: 0.01 },
      threshold: 0.02,
    }),
    'same'
  );
  assert.equal(
    classifyCapture({
      baseline: true,
      diff: { changedRatio: 0.05 },
      threshold: 0.02,
    }),
    'changed'
  );
});

test('only changed, resized, and errored captures become findings', () => {
  const results = ['new', 'same', 'changed', 'resized', 'error'].map(
    status => ({ status })
  );
  assert.deepEqual(
    findingsFrom(results).map(result => result.status),
    ['changed', 'resized', 'error']
  );
});

test('the report lists every capture with its ratio and region', () => {
  const report = renderMarkdownReport({
    appName: 'Jovie Staging',
    version: '26.9.16',
    threshold: 0.02,
    results: [
      {
        name: 'hud--default.png',
        status: 'changed',
        diff: {
          changedRatio: 0.1234,
          box: { x: 1, y: 2, width: 3, height: 4 },
        },
      },
      { name: 'app--narrow.png', status: 'new', diff: null },
    ],
  });
  assert.match(
    report,
    /\| hud--default\.png \| changed \| 12\.34% \| 1,2 3x4 \|/
  );
  assert.match(report, /\| app--narrow\.png \| new \| n\/a \| n\/a \|/);
});

test('every configured route is an app path the deep link accepts', () => {
  const { routes } = JSON.parse(
    readFileSync(join(here, 'visual-qa.routes.json'), 'utf8')
  );
  assert.ok(routes.length > 0);
  for (const { route, surface } of routes) {
    assert.ok(surface, `${route} needs a surface label`);
    assert.doesNotThrow(() =>
      buildRouteDeepLink(APP_TARGETS.staging.scheme, route)
    );
  }
});
