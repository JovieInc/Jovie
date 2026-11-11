import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { driftHistory, run } from './pin-drift.mjs';

const NOW = Date.parse('2026-11-11T20:00:00Z');

function fixture(t) {
  const repo = mkdtempSync(join(tmpdir(), 'company-pin-drift-'));
  t.after(() => rmSync(repo, { recursive: true, force: true }));
  const env = {
    ...process.env,
    GIT_CONFIG_NOSYSTEM: '1',
    GIT_AUTHOR_NAME: 'Test',
    GIT_AUTHOR_EMAIL: 'test@example.invalid',
    GIT_COMMITTER_NAME: 'Test',
    GIT_COMMITTER_EMAIL: 'test@example.invalid',
  };
  const git = (args, date = '2026-11-11T18:00:00Z') =>
    execFileSync('git', args, {
      cwd: repo,
      encoding: 'utf8',
      env: { ...env, GIT_AUTHOR_DATE: date, GIT_COMMITTER_DATE: date },
    }).trim();
  git(['init', '-q', '-b', 'main']);
  git(['config', 'core.hooksPath', '/dev/null']);
  git(['config', 'commit.gpgsign', 'false']);
  mkdirSync(join(repo, 'guards'));
  writeFileSync(join(repo, 'guards/rule.mjs'), 'original\n');
  git(['add', '.']);
  git(['commit', '-qm', 'original'], '2026-10-20T18:00:00Z');
  const original = git(['rev-parse', 'HEAD']);
  git(['commit', '--allow-empty', '-qm', 'pin']);
  const pin = git(['rev-parse', 'HEAD']);
  const tip = () => git(['update-ref', 'refs/remotes/origin/main', 'HEAD']);
  tip();
  return { repo, git, original, pin, tip };
}

test('ages an old branch change from its merge onto main', t => {
  const f = fixture(t);
  f.git(['checkout', '-qb', 'old-branch', f.original]);
  writeFileSync(join(f.repo, 'guards/rule.mjs'), 'new rule\n');
  f.git(['commit', '-qam', 'old branch rule'], '2026-10-30T18:00:00Z');
  f.git(['checkout', '-q', 'main']);
  f.git(
    ['merge', '--no-ff', '-qm', 'land old rule', 'old-branch'],
    '2026-11-11T19:00:00Z'
  );
  f.tip();
  const history = driftHistory({ repo: f.repo, pin: f.pin });
  assert.deepEqual(
    history.map(c => ({ ...c, date: Date.parse(c.date) })),
    [{ sha: f.git(['rev-parse', 'HEAD']), date: NOW - 3_600_000 }]
  );
  assert.equal(NOW - Date.parse(history[0].date), 3_600_000);
});

test('retains old mainline guard changes and excludes unrelated commits', t => {
  const f = fixture(t);
  writeFileSync(join(f.repo, 'guards/rule.mjs'), 'stale rule\n');
  f.git(['commit', '-qam', 'old landed rule'], '2026-11-08T18:00:00Z');
  const landed = f.git(['rev-parse', 'HEAD']);
  writeFileSync(join(f.repo, 'README.md'), 'unrelated\n');
  f.git(['add', '.']);
  f.git(['commit', '-qm', 'docs only']);
  f.tip();
  assert.deepEqual(
    driftHistory({ repo: f.repo, pin: f.pin }).map(c => ({
      ...c,
      date: Date.parse(c.date),
    })),
    [{ sha: landed, date: Date.parse('2026-11-08T18:00:00Z') }]
  );
});

test('current pin produces no unpulled history', t => {
  const f = fixture(t);
  assert.deepEqual(driftHistory({ repo: f.repo, pin: f.pin }), []);
});

test('missing history and nonancestor pins fail closed', t => {
  const f = fixture(t);
  f.git(['branch', 'side']);
  f.git(['checkout', '-q', 'side']);
  f.git(['commit', '--allow-empty', '-qm', 'side pin']);
  const side = f.git(['rev-parse', 'HEAD']);
  assert.throws(() => driftHistory({ repo: f.repo, pin: side }), /ancestor/);
  assert.throws(() => driftHistory({ repo: f.repo, pin: 'bad' }), /exact pin/);
  writeFileSync(join(f.repo, '.git/shallow'), `${f.pin}\n`);
  assert.throws(
    () => driftHistory({ repo: f.repo, pin: f.pin }),
    /complete shared CI history/
  );
  rmSync(join(f.repo, '.git/shallow'));
  f.git(['update-ref', '-d', 'refs/remotes/origin/main']);
  assert.throws(() => driftHistory({ repo: f.repo, pin: f.pin }));
});

test('preserves the upstream evaluator verdict and failure reason', t => {
  const f = fixture(t);
  const lines = [];
  assert.equal(
    run({
      repo: f.repo,
      pin: f.pin,
      now: NOW,
      log: s => lines.push(s),
      evaluate(pin, commits, now) {
        assert.equal(pin, f.pin);
        assert.deepEqual(commits, []);
        assert.equal(now, NOW);
        return { ok: false, reason: 'upstream 72h policy rejected' };
      },
    }),
    1
  );
  assert.deepEqual(lines, ['pin-drift: upstream 72h policy rejected']);
  assert.equal(
    run({
      repo: f.repo,
      pin: f.pin,
      now: NOW,
      log() {},
      evaluate: () => ({ ok: true }),
    }),
    0
  );
});
