import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { listSurfaceFiles } from './lib/coverage-surface-files.mjs';

function fixture(t) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'coverage-surface-')));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const write = (path, text = '') => {
    const dest = join(root, path);
    mkdirSync(dirname(dest), { recursive: true });
    writeFileSync(dest, text);
  };
  for (const path of [
    'apps/web/app/[username]/page.tsx',
    'apps/web/app/[username]/[...slug]/page.tsx',
    'apps/web/app/[username]/[[...optional]]/page.tsx',
    'apps/web/app/r/page.tsx',
    'apps/web/app/s/page.tsx',
  ])
    write(path);
  return { root, write };
}

test('literal dynamic routes exclude character-class decoys and retain globstars', async t => {
  const { root } = fixture(t);
  const files = await listSurfaceFiles('apps/web/app/[username]/**', root);
  assert(files.includes('apps/web/app/[username]/page.tsx'));
  assert(files.includes('apps/web/app/[username]/[...slug]/page.tsx'));
  assert(files.every(path => path.startsWith('apps/web/app/[username]')));
});

test('catch-all and optional catch-all brackets stay literal', async t => {
  const { root } = fixture(t);
  for (const segment of ['[...slug]', '[[...optional]]']) {
    assert.deepEqual(
      await listSurfaceFiles(`apps/web/app/[username]/${segment}/*.tsx`, root),
      [`apps/web/app/[username]/${segment}/page.tsx`]
    );
  }
});

test('ordinary wildcards, single-file line ranges, and missing paths retain behavior', async t => {
  const { root } = fixture(t);
  assert.equal(
    (await listSurfaceFiles('apps/web/app/*/page.tsx', root)).length,
    3
  );
  assert.deepEqual(
    await listSurfaceFiles('apps/web/app/[username]/page.tsx:1-5', root),
    ['apps/web/app/[username]/page.tsx']
  );
  assert.deepEqual(await listSurfaceFiles('missing.ts:1-5', root), []);
  assert.deepEqual(await listSurfaceFiles('missing/**', root), []);
});

test('actual audit gates profile regressions independently of /r and /s coverage', t => {
  const { root, write } = fixture(t);
  write('scripts/lib/coverage-surface-files.mjs');
  for (const file of [
    'audit-test-coverage.ts',
    'lib/coverage-surface-files.mjs',
  ]) {
    copyFileSync(new URL(file, import.meta.url), join(root, 'scripts', file));
  }
  write(
    'docs/TEST_RISK_REGISTER.md',
    `---
last_reviewed: 2026-09-29
surfaces:
  - id: public-profile-isr
    surface: Public profile ISR
    glob: apps/web/app/[username]/**
    blast_radius: 5
    reversibility: 5
    visibility: 5
    target_coverage: 75
    target_e2e: 1
---
`
  );
  write(
    'apps/web/reports/test-coverage-snapshot.json',
    JSON.stringify({
      surfaces: { 'public-profile-isr': { coverage_pct: 80 } },
    })
  );
  for (const profileCovered of [true, false]) {
    const coverage = Object.fromEntries(
      ['[username]', 'r', 's'].map(segment => [
        join(root, 'apps/web/app', segment, 'page.tsx'),
        {
          s: {
            0: Number(
              segment === '[username]' ? profileCovered : !profileCovered
            ),
          },
          b: {},
        },
      ])
    );
    write('apps/web/coverage/coverage-final.json', JSON.stringify(coverage));
    const result = spawnSync(
      process.execPath,
      ['scripts/audit-test-coverage.ts', '--check-pr'],
      {
        cwd: root,
        encoding: 'utf8',
        timeout: 30000,
      }
    );
    assert.equal(result.error, undefined);
    assert.equal(
      result.status,
      profileCovered ? 0 : 1,
      result.stdout + result.stderr
    );
    assert.match(
      result.stdout + result.stderr,
      profileCovered
        ? /No regression on RED surfaces/
        : /public-profile-isr: 80% → 0%/
    );
  }
});
