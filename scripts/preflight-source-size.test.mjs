import assert from 'node:assert/strict';
import test from 'node:test';
import { companionChecklist } from './lib/preflight-changed.mjs';

const source = 'apps/web/tests/e2e/profile-visual-audit.spec.ts';
const baselinePath = 'scripts/company-guards/size-baseline.json';

function inspect(text, baseline = {}, status = 'modified', filename = source) {
  return companionChecklist([{ filename, status }], path => {
    if (path === baselinePath) return JSON.stringify(baseline);
    return path === filename ? text : '';
  }).filter(item => item.item === 'source file fits company size budget');
}

test('preflight catches the JOV-12153 growth before pushing', () => {
  const [item] = inspect('line\n'.repeat(560), { [source]: 542 });
  assert.equal(item.done, false);
  assert.equal(item.trigger, source);
  assert.match(item.hint, /560.*542/);
  assert.match(item.hint, /extract/);
});

test('baselined files may stay the same size or shrink', () => {
  for (const lines of [500, 530, 542]) {
    assert.deepEqual(inspect('line\n'.repeat(lines), { [source]: 542 }), []);
  }
});

test('new code files have a 500-line budget, with or without a final newline', () => {
  for (const suffix of ['', '\n']) {
    const text = Array(500).fill('line').join('\n') + suffix;
    assert.deepEqual(inspect(text, {}, 'added'), []);
    const [item] = inspect(`line\n${text}`, {}, 'added');
    assert.equal(item.done, false);
    assert.match(item.hint, /501.*500/);
  }
});

test('growth below 500 is allowed even with an older smaller baseline', () => {
  assert.deepEqual(inspect('line\r\n'.repeat(500), { [source]: 480 }), []);
});

test('removed files, non-code and company-excluded paths are ignored', () => {
  const text = 'line\n'.repeat(560);
  assert.deepEqual(inspect(text, {}, 'removed'), []);
  for (const filename of [
    'docs/guide.md',
    'node_modules/example/index.ts',
    'apps/web/.next/server.js',
    'scripts/example.gen.mjs',
    'scripts/example.generated.ts',
    'scripts/example.min.js',
    'types/example.d.ts',
    'scripts/lockfile.mjs',
  ]) {
    assert.deepEqual(inspect(text, {}, 'modified', filename), []);
  }
});

test('each company-supported code extension is checked', () => {
  for (const extension of [
    'ts',
    'tsx',
    'js',
    'jsx',
    'mjs',
    'cjs',
    'py',
    'swift',
    'ex',
    'exs',
    'sh',
    'rb',
    'go',
    'rs',
  ]) {
    const [item] = inspect(
      'line\n'.repeat(501),
      {},
      'modified',
      `src/file.${extension}`
    );
    assert.equal(item.done, false, extension);
  }
});

test('files outside the changed set do not create size failures', () => {
  assert.deepEqual(
    companionChecklist([], path =>
      path === baselinePath
        ? JSON.stringify({ [source]: 542 })
        : 'line\n'.repeat(560)
    ),
    []
  );
});

test('a new scripts test listed in the planner contract list counts as wired', () => {
  const filename = 'scripts/lib/__tests__/new-planner.test.mjs';
  const wiring = list =>
    companionChecklist([{ filename, status: 'added' }], path =>
      path === 'scripts/lib/test-planner-contract-tests.mjs' ? list : ''
    ).find(item => item.item === 'new scripts test wired into a CI lane');
  assert.equal(wiring(`['${filename}',]`).done, true);
  assert.equal(wiring("['scripts/lib/__tests__/other.test.mjs',]").done, false);
});
