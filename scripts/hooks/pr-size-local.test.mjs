import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { parseNumstatZ } from '../lib/pr-size-count.mjs';
import { decide } from './pr-size-local.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, '..', '..');
const POLICY = {
  maxLines: 1500,
  maxFiles: 75,
  optOutLabels: ['big-pr', 'codemod'],
  skipAuthors: ['dependabot[bot]'],
  skipHeadRefs: ['screenshots/auto-update'],
};
const base = {
  policy: POLICY,
  labels: [],
  body: '',
  branch: 'feat/x',
  author: '',
  declared: '',
};

test('numstat parser: renames count once under the new path, binaries count zero', () => {
  const raw = [
    '3\t1\ta.ts',
    '-\t-\timg.png',
    '2\t0\t',
    'old.ts',
    'new.ts',
    '',
  ].join('\0');
  assert.deepEqual(parseNumstatZ(raw), ['4\ta.ts', '0\timg.png', '2\tnew.ts']);
});

test('under the cap passes; over the cap blocks with the largest files listed', () => {
  assert.equal(decide({ ...base, rows: ['1500\tapps/web/a.ts'] }).code, 0);
  const over = decide({
    ...base,
    rows: ['1200\tapps/web/a.ts', '301\tapps/web/b.ts'],
  });
  assert.equal(over.code, 1);
  assert.match(
    over.lines.join('\n'),
    /1501 lines \/ 2 files counted; cap 1500\/75/
  );
  assert.match(over.lines.join('\n'), /--no-verify/);
});

test('tests, fixtures, lockfiles and generated files do not count (same module CI uses)', () => {
  const rows = [
    '900\tapps/web/a.ts',
    '5000\tpnpm-lock.yaml',
    '4000\tapps/web/a.test.ts',
    '3000\tapps/web/__fixtures__/big.json',
    '2000\tapps/web/lib/x.gen.ts',
    '700\tdrizzle/migrations/meta/0001_snapshot.json',
  ];
  const r = decide({ ...base, rows });
  assert.equal(r.code, 0, r.lines.join('\n'));
  assert.match(r.lines.join('\n'), /900 lines \/ 1 files/);
});

test('file-count cap applies independently of lines', () => {
  const rows = Array.from({ length: 76 }, (_, i) => `1\tsrc/f${i}.ts`);
  assert.equal(decide({ ...base, rows }).code, 1);
});

test('opt-out labels on the PR pass, exactly like CI', () => {
  const rows = ['9999\tsrc/a.ts'];
  assert.equal(decide({ ...base, rows, labels: ['codemod'] }).code, 0);
  assert.equal(decide({ ...base, rows, labels: ['big-pr'] }).code, 0);
  assert.equal(decide({ ...base, rows, labels: ['enhancement'] }).code, 1);
});

test('a declared opt-out passes locally but says CI needs the real label; unknown labels are refused', () => {
  const rows = ['9999\tsrc/a.ts'];
  const ok = decide({ ...base, rows, declared: 'big-pr' });
  assert.equal(ok.code, 0);
  assert.match(
    ok.lines.join('\n'),
    /CI still requires the real "big-pr" label/
  );
  assert.equal(decide({ ...base, rows, declared: 'please' }).code, 1);
});

test('integration-train uses the policy module cap and needs >=2 pinned sources', () => {
  const rows = ['2000\tsrc/a.ts'];
  assert.equal(
    decide({ ...base, rows, labels: ['integration-train'] }).code,
    1
  );
  const sha = 'a'.repeat(40);
  const body = `<!-- integration-train-sources\n- https://github.com/JovieInc/Jovie/pull/1 @ ${sha}\n- https://github.com/JovieInc/Jovie/pull/2 @ ${'b'.repeat(40)}\n-->`;
  assert.equal(
    decide({ ...base, rows, labels: ['integration-train'], body }).code,
    0
  );
});

test('CI-exempt branches and authors are exempt locally', () => {
  const rows = ['9999\tsrc/a.ts'];
  assert.equal(
    decide({ ...base, rows, branch: 'screenshots/auto-update' }).code,
    0
  );
  assert.equal(decide({ ...base, rows, author: 'dependabot[bot]' }).code, 0);
});

test('end to end: stacked branch counts only against its parent when JOVIE_PR_BASE is set', () => {
  const dir = mkdtempSync(join(tmpdir(), 'pr-size-local-'));
  const env = {
    ...process.env,
    GIT_AUTHOR_NAME: 't',
    GIT_AUTHOR_EMAIL: 't@example.com',
    GIT_COMMITTER_NAME: 't',
    GIT_COMMITTER_EMAIL: 't@example.com',
    JOVIE_PR_SIZE_GH: '0',
  };
  const git = (...a) =>
    execFileSync(
      'git',
      ['-c', 'commit.gpgsign=false', '-c', 'tag.gpgsign=false', ...a],
      { cwd: dir, env, stdio: 'pipe' }
    );
  try {
    for (const f of [
      'scripts/hooks/pr-size-local.mjs',
      'scripts/lib/pr-size-count.mjs',
      'scripts/lib/pr-size-exclusions.mjs',
      'scripts/lib/pr-size-guard-policy.mjs',
      'scripts/lib/pr-size-policy.json',
    ]) {
      mkdirSync(join(dir, dirname(f)), { recursive: true });
      cpSync(join(REPO, f), join(dir, f));
    }
    git('init', '-q', '-b', 'main');
    git('add', '.');
    git('commit', '-qm', 'base');
    git('update-ref', 'refs/remotes/origin/main', 'HEAD');
    git('checkout', '-qb', 'parent');
    writeFileSync(join(dir, 'p.ts'), 'x\n'.repeat(1000));
    git('add', '.');
    git('commit', '-qm', 'parent');
    git('update-ref', 'refs/remotes/origin/parent', 'HEAD');
    git('checkout', '-qb', 'child');
    writeFileSync(join(dir, 'c.ts'), 'y\n'.repeat(1000));
    git('add', '.');
    git('commit', '-qm', 'child');
    const run = extra =>
      spawnSync(process.execPath, ['scripts/hooks/pr-size-local.mjs'], {
        cwd: dir,
        env: { ...env, ...extra },
        encoding: 'utf8',
      });
    const vsMain = run({});
    assert.equal(vsMain.status, 1, vsMain.stderr);
    assert.match(vsMain.stderr, /set JOVIE_PR_BASE=<parent>/);
    const vsParent = run({ JOVIE_PR_BASE: 'parent' });
    assert.equal(vsParent.status, 0, vsParent.stderr);
    assert.equal(run({ JOVIE_PR_SIZE_LOCAL: '0' }).status, 0);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
