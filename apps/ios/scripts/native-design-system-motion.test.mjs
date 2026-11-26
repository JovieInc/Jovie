import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { test } from 'node:test';
import { MANIFEST, ROOT } from './native-design-system.mjs';
import {
  MOTION_END,
  MOTION_START,
  projectedMotion,
  replaceMotionProjection,
  rootToken,
} from './native-design-system-motion.mjs';

const manifest = JSON.parse(readFileSync(resolve(ROOT, MANIFEST), 'utf8'));
const css = readFileSync(resolve(ROOT, manifest.semantics), 'utf8');

test('rootToken resolves --scale-press from :root only', () => {
  assert.equal(rootToken(css, '--scale-press'), '0.98');
  assert.equal(
    rootToken(
      ':root.dark { --scale-press: 0.5; }\n:root { --scale-press: 0.98; }',
      '--scale-press'
    ),
    '0.98'
  );
  assert.throws(
    () =>
      rootToken(
        ':root { --scale-press: 0.98; }\n:root { --scale-press: 0.96; }',
        '--scale-press'
      ),
    /Conflicting/
  );
  assert.throws(() => rootToken(css, 'scale-press'), /CSS token/);
});

test('motion projection binds pressScale to web --scale-press', () => {
  const output = projectedMotion(manifest.motionBindings, css);
  assert.ok(output.includes(MOTION_START));
  assert.ok(output.includes(MOTION_END));
  assert.ok(output.includes('/// Source: --scale-press'));
  assert.ok(output.includes('static let pressScale: CGFloat = 0.98'));
  assert.throws(() => projectedMotion([], css), /required/);
  assert.throws(
    () => projectedMotion([['pressScale', 'scale-press']], css),
    /CSS token/
  );
  assert.throws(
    () => projectedMotion([['pressScale', '--missing-token']], css),
    /Missing/
  );
  assert.throws(
    () =>
      projectedMotion(
        [['pressScale', '--scale-press']],
        ':root { --scale-press: 12px; }'
      ),
    /Unsupported/
  );
  assert.throws(
    () =>
      projectedMotion(
        [
          ['pressScale', '--scale-press'],
          ['pressScale', '--scale-press'],
        ],
        css
      ),
    /Duplicate/
  );
});

test('motion boundary replace is exact and catches stale native press scales', () => {
  const projection = projectedMotion(manifest.motionBindings, css);
  const source = `enum JovieMotion {\n${MOTION_START}\n  static let pressScale: CGFloat = 0.96\n${MOTION_END}\n}`;
  const green = replaceMotionProjection(source, projection);
  assert.match(green, /pressScale: CGFloat = 0\.98/);
  assert.equal(replaceMotionProjection(green, projection), green);
  assert.throws(
    () => replaceMotionProjection(source + MOTION_START, projection),
    /boundary/
  );
  assert.throws(
    () => replaceMotionProjection('no boundary', projection),
    /boundary/
  );
});
