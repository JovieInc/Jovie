import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ownsLease } from './writer-identity.mjs';

test('worker ownership requires both holder and current PID', () => {
  assert.equal(ownsLease(null, 'a'), false);
  assert.equal(ownsLease({ holder: 'a', pid: process.pid }, 'a'), true);
  assert.equal(ownsLease({ holder: 'a', pid: process.pid + 1 }, 'a'), false);
  assert.equal(ownsLease({ holder: 'a', pid: process.pid }, 'b'), false);
});

test('manual ownership requires the issued token even when PID matches', () => {
  const lease = { holder: 'a', pid: process.pid, token: 'test-session' };
  assert.equal(ownsLease(lease, 'a'), false);
  assert.equal(ownsLease(lease, 'a', 'wrong'), false);
  assert.equal(ownsLease(lease, 'b', lease.token), false);
  assert.equal(
    ownsLease({ ...lease, pid: process.pid + 1 }, 'a', lease.token),
    true
  );
});
