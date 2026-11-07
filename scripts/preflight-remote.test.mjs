import assert from 'node:assert/strict';
import { test } from 'node:test';
import { remoteHint } from './lib/remote-hint.mjs';
import {
  branchSlug,
  buildRemoteScript,
  parseRemoteArgs,
} from './preflight-remote.mjs';

test('branchSlug is filesystem safe', () => {
  assert.equal(branchSlug('feat/a b'), 'feat__a__b');
  assert.equal(branchSlug('..x'), '_x');
});

test('parseRemoteArgs keeps preflight:changed args and extracts ours', () => {
  const a = parseRemoteArgs(
    ['--base', 'dev', '--body-file', 'b.md', '--no-push', '--no-coverage'],
    { JOVIE_REMOTE_PREFLIGHT_SLOTS: '3' }
  );
  assert.deepEqual(a.forward, ['--base', 'dev', '--no-coverage']);
  assert.equal(a.bodyFile, 'b.md');
  assert.equal(a.push, false);
  assert.equal(a.slots, 3);
  assert.equal(a.host, 'gem');
});

test('remote script gates on slots, uses nvmrc, and propagates exit status', () => {
  const s = buildRemoteScript({
    slug: 'feat__x',
    branch: 'feat/x',
    sha: 'a'.repeat(40),
    originUrl: 'git@github.com:JovieInc/Jovie.git',
    slots: 4,
    forward: ['--no-coverage'],
    bodyB64: 'aGk=',
  });
  assert.match(s, /seq 0 \$\(\(4 - 1\)\)/);
  assert.match(s, /nvm use/);
  assert.match(s, /pnpm preflight:changed '--no-coverage'/);
  assert.match(s, /--body-file/);
  assert.match(s, /exit \$rc/);
  assert.doesNotMatch(s, /~\/Jovie/);
});

test('remoteHint fires only above 2x cores', () => {
  assert.match(
    remoteHint({ load: 50, cores: 12, env: {} }),
    /preflight:remote/
  );
  assert.equal(remoteHint({ load: 20, cores: 12, env: {} }), null);
  assert.equal(remoteHint({ load: 99, cores: 12, env: { CI: '1' } }), null);
});

test('remote script runs preflight inside the agent-preflight slice when installed', () => {
  const s = buildRemoteScript({
    slug: 'feat__x',
    branch: 'feat/x',
    sha: 'a'.repeat(40),
    originUrl: 'git@github.com:JovieInc/Jovie.git',
    slots: 2,
    forward: [],
    bodyB64: '',
  });
  assert.match(
    s,
    /agent-run" \] && RUN="\$HOME\/\.local\/bin\/agent-run preflight"/
  );
  assert.match(s, /timeout 45m nice -n 10 \$RUN pnpm preflight:changed/);
});

test('bundle mode fetches the shipped bundle and emits sha+tree evidence', () => {
  const s = buildRemoteScript({
    slug: 'feat__x',
    branch: 'feat/x',
    sha: 'b'.repeat(40),
    originUrl: 'git@github.com:JovieInc/Jovie.git',
    slots: 2,
    forward: ['--fast'],
    bodyB64: '',
    bundle: true,
  });
  assert.match(s, /\.bundles\/b{40}\.bundle/);
  assert.match(s, /HEAD\^\{tree\}/);
  assert.match(s, /PREFLIGHT_REMOTE_EVIDENCE/);
  assert.equal(parseRemoteArgs(['--bundle']).push, false);
});

test('a full Gem hands off after the queue limit instead of queuing forever', async () => {
  const { spawnSync } = await import('node:child_process');
  const { mkdtempSync, mkdirSync, rmSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const path = await import('node:path');
  const { SLOTS_BUSY_EXIT } = await import('./lib/prepush-offload.mjs');
  const s = buildRemoteScript({
    slug: 'feat__x',
    branch: 'feat/x',
    sha: 'c'.repeat(40),
    originUrl: 'git@github.com:JovieInc/Jovie.git',
    slots: 1,
    forward: ['--fast'],
    bodyB64: '',
    bundle: true,
    queueMaxSec: 1,
  });
  assert.match(s, new RegExp(`exit ${SLOTS_BUSY_EXIT}`));
  assert.equal(parseRemoteArgs(['--queue-max-sec', '90']).queueMaxSec, 90);
  assert.equal(parseRemoteArgs([]).queueMaxSec, 0);
  assert.deepEqual(
    parseRemoteArgs(['--queue-max-sec', '5', '--fast']).forward,
    ['--fast']
  );
  // Run only the slot gate with the single slot held by another process.
  if (spawnSync('sh', ['-c', 'command -v flock']).status !== 0) return;
  const gate = s.slice(
    s.indexOf('# 3. host-wide'),
    s.indexOf('# 4. body file')
  );
  const home = mkdtempSync(path.join(tmpdir(), 'gem-slots-'));
  mkdirSync(path.join(home, '.cache/gem-remote-preflight-slots'), {
    recursive: true,
  });
  try {
    const r = spawnSync(
      'flock',
      [
        path.join(home, '.cache/gem-remote-preflight-slots/slot-0.lock'),
        'bash',
        '-c',
        `${gate}\necho got-slot`,
      ],
      { encoding: 'utf8', timeout: 20_000, env: { ...process.env, HOME: home } }
    );
    assert.equal(r.status, SLOTS_BUSY_EXIT, r.stderr);
    assert.match(r.stderr, /still busy after 1s; handing off/);
    assert.doesNotMatch(r.stdout, /got-slot/);
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});
