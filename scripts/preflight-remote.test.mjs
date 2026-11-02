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
