import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  checkBreaker,
  deploymentState,
  isBlockedState,
  isBreakerOpen,
  isTerminalFailureState,
  readBreaker,
  SCHEMA,
  tripBreaker,
  writeBreaker,
} from './vercel-blocked-breaker.mjs';

const SCRIPT = fileURLToPath(
  new URL('./vercel-blocked-breaker.mjs', import.meta.url)
);

function tempDir(t) {
  const dir = mkdtempSync(join(tmpdir(), 'jovie-blocked-breaker-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  return dir;
}

test('deploymentState prefers readyState and a concrete blocked reason', () => {
  const seen = deploymentState({
    readyState: 'blocked',
    readyStateReason: 'Concurrent builds limit reached',
    errorMessage: 'ignored when readyStateReason exists',
    id: 'dpl_blocked',
    url: 'jovie-blocked.vercel.app',
  });
  assert.equal(seen.state, 'BLOCKED');
  assert.equal(seen.reason, 'Concurrent builds limit reached');
  assert.equal(isBlockedState(seen.state), true);
  assert.equal(isTerminalFailureState(seen.state), true);
});

test('tripBreaker records an open window that expires after the TTL', () => {
  const now = Date.parse('2026-11-14T02:12:00Z');
  const state = tripBreaker({
    reason: 'Concurrent builds limit reached',
    deploymentUrl: 'https://jovie-blocked.vercel.app',
    deploymentId: 'dpl_blocked',
    now,
    ttlSeconds: 1800,
  });
  assert.equal(state.schema, SCHEMA);
  assert.equal(state.state, 'open');
  assert.equal(state.openUntil, now + 1800_000);
  assert.equal(isBreakerOpen(state, now + 1), true);
  assert.equal(isBreakerOpen(state, now + 1800_000), false);
  assert.equal(isBreakerOpen(state, now + 1800_001), false);
});

test('checkBreaker reports closed when the file is missing or expired', t => {
  const dir = tempDir(t);
  const path = join(dir, 'breaker.json');
  assert.deepEqual(checkBreaker(path, 1_000), { open: false, state: null });

  const expired = tripBreaker({ reason: 'old', now: 0, ttlSeconds: 1 });
  writeBreaker(expired, path);
  assert.equal(checkBreaker(path, 2_000).open, false);

  const open = tripBreaker({ reason: 'live', now: 1_000, ttlSeconds: 60 });
  writeBreaker(open, path);
  const result = checkBreaker(path, 1_500);
  assert.equal(result.open, true);
  assert.equal(result.state.reason, 'live');
  assert.equal(readBreaker(path).schema, SCHEMA);
});

test('CLI check exits 1 while open and 0 when closed', t => {
  const dir = tempDir(t);
  const path = join(dir, 'breaker.json');
  const nowMs = '1700000000000';
  const closed = spawnSync(process.execPath, [SCRIPT, 'check'], {
    env: {
      ...process.env,
      VERCEL_BLOCKED_BREAKER_PATH: path,
      VERCEL_BLOCKED_BREAKER_NOW_MS: nowMs,
    },
    encoding: 'utf8',
  });
  assert.equal(closed.status, 0, closed.stderr);

  writeBreaker(
    tripBreaker({
      reason: 'Concurrent builds limit reached',
      now: Number(nowMs),
      ttlSeconds: 600,
    }),
    path
  );
  const open = spawnSync(process.execPath, [SCRIPT, 'check'], {
    env: {
      ...process.env,
      VERCEL_BLOCKED_BREAKER_PATH: path,
      VERCEL_BLOCKED_BREAKER_NOW_MS: nowMs,
    },
    encoding: 'utf8',
  });
  assert.equal(open.status, 1);
  assert.match(open.stderr, /Vercel blocked breaker is open/);
  assert.match(open.stderr, /Concurrent builds limit reached/);
  assert.match(open.stderr, /Skipping vercel build/);
});

test('CLI inspect-json exits 75 on BLOCKED so deploy can fail fast', t => {
  const dir = tempDir(t);
  const file = join(dir, 'inspect.json');
  writeFileSync(
    file,
    JSON.stringify({
      readyState: 'BLOCKED',
      readyStateReason: 'Spend management paused deployments',
      id: 'dpl_x',
      url: 'blocked.vercel.app',
    })
  );
  const blocked = spawnSync(process.execPath, [SCRIPT, 'inspect-json', file], {
    encoding: 'utf8',
  });
  assert.equal(blocked.status, 75);
  assert.match(blocked.stderr, /BLOCKED/);
  assert.match(blocked.stderr, /Spend management paused deployments/);
  const receipt = JSON.parse(blocked.stdout);
  assert.equal(receipt.state, 'BLOCKED');

  writeFileSync(file, JSON.stringify({ readyState: 'READY', id: 'dpl_ok' }));
  const ready = spawnSync(process.execPath, [SCRIPT, 'inspect-json', file], {
    encoding: 'utf8',
  });
  assert.equal(ready.status, 0, ready.stderr);
});
