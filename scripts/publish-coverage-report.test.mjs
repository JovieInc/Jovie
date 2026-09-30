import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
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
import { publishCoverageReport } from './lib/publish-coverage-report.mjs';

const heatmap = 'docs/TEST_COVERAGE_HEATMAP.md';
const snapshot = 'apps/web/reports/test-coverage-snapshot.json';
const url = 'https://github.com/JovieInc/Jovie/pull/123';

function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), 'coverage-publication-test-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const cwd = join(root, 'checkout');
  const remote = join(root, 'origin.git');
  mkdirSync(cwd);
  const git = (...args) =>
    execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();
  git('init', '--quiet', '--initial-branch=main');
  git('config', 'user.name', 'Coverage Test');
  git('config', 'user.email', 'coverage@example.invalid');
  git('config', 'commit.gpgsign', 'false');
  mkdirSync(join(cwd, 'docs'), { recursive: true });
  mkdirSync(join(cwd, 'apps/web/reports'), { recursive: true });
  writeFileSync(join(cwd, heatmap), 'before\n');
  writeFileSync(join(cwd, snapshot), '{}\n');
  writeFileSync(join(cwd, 'source.txt'), 'measured\n');
  git('add', '.');
  git('commit', '--quiet', '-m', 'initial');
  git('init', '--quiet', '--bare', remote);
  git('remote', 'add', 'origin', remote);
  git('push', '--quiet', 'origin', 'main');
  // Reproduce the hosted boundary: main can never be directly updated.
  writeFileSync(
    join(remote, 'hooks/update'),
    '#!/bin/sh\n[ "$1" != refs/heads/main ]\n',
    { mode: 0o755 }
  );
  const source = git('rev-parse', 'HEAD');
  const env = {
    ...process.env,
    GITHUB_SHA: source,
    GITHUB_REPOSITORY: 'JovieInc/Jovie',
    GITHUB_RUN_ID: '12345',
    GITHUB_RUN_ATTEMPT: '1',
    GITHUB_STEP_SUMMARY: join(root, 'summary.md'),
  };
  const calls = [];
  const gh = args => {
    calls.push(args);
    if (args[0] === 'pr') {
      const body = readFileSync(args[args.indexOf('--body-file') + 1], 'utf8');
      assert.ok(body.includes(source));
      assert.ok(body.includes('/actions/runs/12345/attempts/1'));
      assert.ok(args.includes('--draft'));
      assert.equal(args[args.indexOf('--base') + 1], 'main');
      return url;
    }
    return '';
  };
  const change = () => writeFileSync(join(cwd, heatmap), 'measured coverage\n');
  return { cwd, root, remote, git, source, env, calls, gh, change };
}

test('publishes only measured reports on an exact-source draft branch while main is protected', t => {
  const f = fixture(t);
  f.change();
  writeFileSync(join(f.cwd, snapshot), '{"coverage":86.8}\n');
  writeFileSync(join(f.cwd, 'untracked.txt'), 'not a report');
  const result = publishCoverageReport(f);
  assert.equal(result.url, url);
  assert.equal(result.status, 'published');
  assert.equal(f.git('rev-parse', 'HEAD^'), f.source);
  assert.equal(f.git('rev-parse', 'origin/main'), f.source);
  assert.equal(f.git('show', 'HEAD:source.txt'), 'measured');
  assert.deepEqual(
    f
      .git('diff-tree', '--no-commit-id', '--name-only', '-r', 'HEAD')
      .split('\n'),
    [snapshot, heatmap]
  );
  assert.equal(
    f.git('rev-parse', `origin/${result.branch}`),
    f.git('rev-parse', 'HEAD')
  );
  assert.deepEqual(f.calls[0], [
    'auth',
    'setup-git',
    '--hostname',
    'github.com',
  ]);
  assert.match(readFileSync(f.env.GITHUB_STEP_SUMMARY, 'utf8'), /pull\/123/);
  for (const line of f.git('log', '-1', '--format=%B').split('\n'))
    assert.ok(line.length <= 100);
});

test('does not mint git credentials or create a PR when the report is unchanged', t => {
  const f = fixture(t);
  assert.deepEqual(publishCoverageReport(f), {
    status: 'unchanged',
    source: f.source,
  });
  assert.deepEqual(f.calls, []);
});

test('refuses mismatched source and unrelated staged changes before external publication', t => {
  const f = fixture(t);
  f.change();
  assert.throws(
    () =>
      publishCoverageReport({
        ...f,
        env: { ...f.env, GITHUB_SHA: 'a'.repeat(40) },
      }),
    /differs/
  );
  writeFileSync(join(f.cwd, 'source.txt'), 'unmeasured');
  f.git('add', 'source.txt');
  assert.throws(() => publishCoverageReport(f), /unrelated/);
  assert.deepEqual(f.calls, []);
  assert.equal(f.git('rev-parse', 'HEAD'), f.source);
});

test('rejects missing or malformed producer identity without running publication', t => {
  const f = fixture(t);
  for (const key of [
    'GITHUB_SHA',
    'GITHUB_REPOSITORY',
    'GITHUB_RUN_ID',
    'GITHUB_RUN_ATTEMPT',
  ]) {
    for (const value of [undefined, '--invalid']) {
      assert.throws(
        () => publishCoverageReport({ ...f, env: { ...f.env, [key]: value } }),
        /Invalid coverage/
      );
    }
  }
  assert.deepEqual(f.calls, []);
});

test('a rejected branch push fails the audit without creating a PR or touching main', t => {
  const f = fixture(t);
  f.change();
  writeFileSync(join(f.remote, 'hooks/update'), '#!/bin/sh\nexit 1\n', {
    mode: 0o755,
  });
  assert.throws(() => publishCoverageReport(f), /Command failed/);
  assert.equal(f.calls.length, 1);
  assert.equal(f.git('rev-parse', 'origin/main'), f.source);
});

test('PR creation failure and missing receipts fail rather than reporting publication success', async t => {
  for (const fail of [true, false]) {
    await t.test(String(fail), sub => {
      const f = fixture(sub);
      f.change();
      assert.throws(
        () =>
          publishCoverageReport({
            ...f,
            gh: args => {
              if (args[0] === 'pr' && fail)
                throw new Error('PR service unavailable');
              return '';
            },
          }),
        fail ? /PR service unavailable/ : /no receipt/
      );
      assert.equal(f.git('rev-parse', 'origin/main'), f.source);
    });
  }
});

test('uses the real gh command adapter and supports runners without a summary file', t => {
  const f = fixture(t);
  f.change();
  const bin = join(f.root, 'bin');
  mkdirSync(bin);
  writeFileSync(
    join(bin, 'gh'),
    `#!/bin/sh\nif [ "$1" = pr ]; then echo '${url}'; fi\n`,
    { mode: 0o755 }
  );
  const env = { ...f.env, PATH: `${bin}:${process.env.PATH}` };
  delete env.GITHUB_STEP_SUMMARY;
  assert.equal(publishCoverageReport({ cwd: f.cwd, env }).url, url);
});
