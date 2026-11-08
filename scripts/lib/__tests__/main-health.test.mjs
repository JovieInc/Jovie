import assert from 'node:assert/strict';
import { test } from 'vitest';
import { receipt } from '../../main-health.mjs';

test('receipt is ok only when every check passed', () => {
  const sha = 'a'.repeat(40);
  const good = [{ check: 'a', ok: true, message: 'ok' }];
  const bad = [...good, { check: 'b', ok: false, message: 'source changed' }];
  assert.equal(receipt(good, { sha, runUrl: null }).ok, true);
  const failing = receipt(bad, {
    sha,
    runUrl: 'https://x',
    now: new Date('2026-10-29T00:00:00Z'),
  });
  assert.equal(failing.ok, false);
  assert.equal(failing.schema, 'jovie.main-health/v1');
  assert.equal(failing.checkedAt, '2026-10-29T00:00:00.000Z');
});
