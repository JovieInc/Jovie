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
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { restoreCoverageBaseline } from './lib/publish-coverage-report.mjs';

const heatmapPath = 'docs/TEST_COVERAGE_HEATMAP.md';
const snapshotPath = 'apps/web/reports/test-coverage-snapshot.json';
const snapshot = {
  generated_at: '2026-11-14T08:00:00Z',
  surfaces: {
    auth: { coverage_pct: 80, branch_pct: 75, risk_score: 5, status: 'RED' },
  },
};
function fixture(t) {
  const cwd = mkdtempSync(join(tmpdir(), 'coverage-artifact-'));
  t.after(() => rmSync(cwd, { recursive: true, force: true }));
  const git = (...args) =>
    execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();
  git('init', '--quiet', '--initial-branch=main');
  git('config', 'user.name', 'Coverage Test');
  git('config', 'user.email', 'coverage@example.invalid');
  git('config', 'commit.gpgsign', 'false');
  mkdirSync(join(cwd, dirname(snapshotPath)), { recursive: true });
  writeFileSync(join(cwd, snapshotPath), 'seed\n');
  mkdirSync(join(cwd, 'docs'));
  writeFileSync(join(cwd, heatmapPath), 'seed heatmap\n');
  git('add', '.');
  git('commit', '--quiet', '-m', 'measured');
  const source = git('rev-parse', 'HEAD');
  const env = {
    GITHUB_REPOSITORY: 'JovieInc/Jovie',
    GITHUB_STEP_SUMMARY: join(cwd, 'summary.md'),
  };
  const run = {
    id: 43569817448,
    head_sha: source,
    head_branch: 'main',
    repository: { full_name: env.GITHUB_REPOSITORY },
    head_repository: { full_name: env.GITHUB_REPOSITORY },
    status: 'completed',
    conclusion: 'success',
    path: '.github/workflows/test-coverage-audit.yml',
  };
  const calls = [];
  let downloadedDir;
  const gh = args => {
    calls.push(args);
    if (args[0] === 'api') return JSON.stringify({ workflow_runs: [run] });
    assert.deepEqual(args.slice(0, -1), [
      'run',
      'download',
      String(run.id),
      '--repo',
      env.GITHUB_REPOSITORY,
      '--name',
      `coverage-audit-${run.id}`,
      '--dir',
    ]);
    downloadedDir = args.at(-1);
    mkdirSync(join(downloadedDir, dirname(snapshotPath)), { recursive: true });
    writeFileSync(join(downloadedDir, snapshotPath), JSON.stringify(snapshot));
    mkdirSync(join(downloadedDir, 'docs'));
    writeFileSync(
      join(downloadedDir, heatmapPath),
      '# Generated: 2026-11-14T08:00:00Z\n'
    );
    return '';
  };
  return {
    cwd,
    env,
    git,
    source,
    run,
    calls,
    gh,
    downloadDir: () => downloadedDir,
  };
}

test('restores a successful main-run snapshot without branch, commit or publication writes', t => {
  const f = fixture(t);
  assert.deepEqual(restoreCoverageBaseline(f), {
    status: 'restored',
    source: f.source,
    run: f.run.id,
  });
  assert.deepEqual(f.calls[0], [
    'api',
    'repos/JovieInc/Jovie/actions/workflows/test-coverage-audit.yml/runs?branch=main&status=success&per_page=1',
  ]);
  assert.deepEqual(
    JSON.parse(readFileSync(join(f.cwd, snapshotPath), 'utf8')),
    snapshot
  );
  assert.equal(
    readFileSync(join(f.cwd, heatmapPath), 'utf8'),
    '# Generated: 2026-11-14T08:00:00Z\n'
  );
  assert.equal(f.git('rev-parse', 'HEAD'), f.source);
  assert.equal(f.git('branch', '--show-current'), 'main');
  assert.match(readFileSync(f.env.GITHUB_STEP_SUMMARY, 'utf8'), /43569817448/);
  assert.throws(
    () => readFileSync(join(f.downloadDir(), snapshotPath)),
    /ENOENT/
  );
  delete f.env.GITHUB_STEP_SUMMARY;
  const baselineFile = join(f.cwd, 'isolated-snapshot.json');
  restoreCoverageBaseline({ ...f, baselineFile });
  assert.deepEqual(JSON.parse(readFileSync(baselineFile, 'utf8')), snapshot);
});

test('uses the committed seed only for an empty successful-run inventory', t => {
  const f = fixture(t);
  assert.deepEqual(
    restoreCoverageBaseline({ ...f, gh: () => '{"workflow_runs":[]}' }),
    { status: 'bootstrap', baseline: snapshotPath }
  );
  assert.equal(readFileSync(join(f.cwd, snapshotPath), 'utf8'), 'seed\n');
  assert.throws(
    () => restoreCoverageBaseline({ ...f, gh: () => '{}' }),
    /inventory/
  );
  assert.throws(() => restoreCoverageBaseline({ ...f, env: {} }), /repository/);
});

test('rejects failed, foreign, non-main, unrelated-workflow and divergent evidence before downloading', t => {
  const f = fixture(t);
  const original = { ...f.run };
  for (const change of [
    { conclusion: 'failure' },
    { status: 'in_progress' },
    { head_branch: 'feature' },
    { repository: { full_name: 'Other/Repo' } },
    { head_repository: { full_name: 'Other/Repo' } },
    { path: '.github/workflows/unrelated.yml' },
    { id: '--invalid' },
    { head_sha: 'invalid' },
  ]) {
    Object.assign(f.run, original, change);
    assert.throws(() => restoreCoverageBaseline(f), /provenance/);
  }
  Object.assign(f.run, original, {
    head_sha: f.git(
      'commit-tree',
      f.git('rev-parse', 'HEAD^{tree}'),
      '-m',
      'divergent'
    ),
  });
  assert.throws(() => restoreCoverageBaseline(f), /Command failed/);
  assert.equal(
    f.calls.some(args => args[0] === 'run'),
    false
  );
  assert.equal(readFileSync(join(f.cwd, snapshotPath), 'utf8'), 'seed\n');
});

test('auth, missing/expired downloads and malformed snapshots fail without erasing the baseline', t => {
  const f = fixture(t);
  assert.throws(
    () =>
      restoreCoverageBaseline({
        ...f,
        gh: () => {
          throw new Error('403');
        },
      }),
    /403/
  );
  assert.throws(
    () =>
      restoreCoverageBaseline({
        ...f,
        gh: args => {
          if (args[0] === 'api') return f.gh(args);
          throw new Error('expired artifact');
        },
      }),
    /expired artifact/
  );
  for (const raw of [
    'not json',
    '{}',
    JSON.stringify({ ...snapshot, surfaces: {} }),
    JSON.stringify({
      ...snapshot,
      surfaces: { auth: { ...snapshot.surfaces.auth, coverage_pct: 101 } },
    }),
  ]) {
    assert.throws(() =>
      restoreCoverageBaseline({
        ...f,
        gh: args => {
          const result = f.gh(args);
          if (args[0] === 'run')
            writeFileSync(join(args.at(-1), snapshotPath), raw);
          return result;
        },
      })
    );
    assert.throws(
      () => readFileSync(join(f.downloadDir(), snapshotPath)),
      /ENOENT/
    );
  }
  assert.equal(readFileSync(join(f.cwd, snapshotPath), 'utf8'), 'seed\n');
});

test('the real gh adapter downloads and validates the named artifact with the supplied environment', t => {
  const f = fixture(t);
  const bin = join(f.cwd, 'bin');
  mkdirSync(bin);
  const fixtureRun = join(f.cwd, 'run.json');
  const fixtureSnapshot = join(f.cwd, 'snapshot.json');
  writeFileSync(fixtureRun, JSON.stringify({ workflow_runs: [f.run] }));
  writeFileSync(fixtureSnapshot, JSON.stringify(snapshot));
  writeFileSync(
    join(bin, 'gh'),
    `#!/bin/sh
case "$1:$2" in
api:*)
  printf 'HTTP/2.0 200 OK\\r\\n\\r\\n'
  cat "$COVERAGE_FIXTURE_RUN" ;;
run:download)
  [ "$3" = 43569817448 ] || exit 1
  [ "$7" = coverage-audit-43569817448 ] || exit 1
  mkdir -p "$9/apps/web/reports"
  cp "$COVERAGE_FIXTURE_SNAPSHOT" "$9/${snapshotPath}"
  mkdir -p "$9/docs"
  printf '# Generated: 2026-11-14T08:00:00Z\\n' > "$9/${heatmapPath}" ;;
*) exit 1 ;;
esac
`,
    { mode: 0o755 }
  );
  const env = {
    ...process.env,
    ...f.env,
    PATH: `${bin}:${process.env.PATH}`,
    COVERAGE_FIXTURE_RUN: fixtureRun,
    LANES_STATE: join(f.cwd, 'ledger'),
    GH_TOKEN: 'fixture-only-token',
    COVERAGE_FIXTURE_SNAPSHOT: fixtureSnapshot,
  };
  assert.equal(restoreCoverageBaseline({ cwd: f.cwd, env }).status, 'restored');
  assert.deepEqual(
    JSON.parse(readFileSync(join(f.cwd, snapshotPath), 'utf8')),
    snapshot
  );
});

test('an invalid heatmap does not partially replace valid baseline data', t => {
  const f = fixture(t);
  assert.throws(
    () =>
      restoreCoverageBaseline({
        ...f,
        gh: args => {
          const result = f.gh(args);
          if (args[0] === 'run')
            writeFileSync(join(args.at(-1), heatmapPath), '');
          return result;
        },
      }),
    /Invalid coverage artifact heatmap/
  );
  assert.equal(readFileSync(join(f.cwd, snapshotPath), 'utf8'), 'seed\n');
  assert.equal(
    readFileSync(join(f.cwd, heatmapPath), 'utf8'),
    'seed heatmap\n'
  );
});
