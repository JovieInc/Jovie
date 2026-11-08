import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { recordTiming } from './metrics.mjs';

test('round and frame observations produce canonical events and p50/p95/n; invalid observations fail', t => {
  const dir = mkdtempSync(join(tmpdir(), 'pen-timings-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const path = join(dir, 'ledger.jsonl');
  const finishedAt = new Date().toISOString();
  const event = {
    frame: 'F',
    startedAt: new Date(Date.now() - 2000).toISOString(),
    finishedAt,
  };
  assert.throws(
    () => recordTiming(path, { ...event, stage: 'unknown' }),
    /unknown stage/
  );
  recordTiming(path, { ...event, stage: 'pen-review-round', action: 'fix' });
  recordTiming(path, { ...event, stage: 'pen-review-frame', verdict: 'fail' });
  const rows = readFileSync(path, 'utf8')
    .trim()
    .split('\n')
    .map(line => JSON.parse(line));
  assert.equal(rows.length, 3);
  assert.ok(rows.every(row => row.schema === 'jovie-stage-event/v1'));
  assert.equal(rows[1].outcome, 'failed');
  const snapshot = JSON.parse(
    readFileSync(join(dir, 'stage-timings-latest.json'), 'utf8')
  );
  for (const stage of ['pen-review-round', 'pen-review-frame']) {
    const stats = snapshot.entities['pen-review'].stages[stage]['24h'];
    assert.equal(stats.n, 1);
    assert.ok(stats.p50 >= 1.9 && stats.p95 <= 2.1);
  }
  assert.equal(snapshot.rejected, 0);
  for (const verdict of ['render-untrusted', 'needs-fix', undefined]) {
    const failedPath = join(dir, String(verdict), 'ledger.jsonl');
    recordTiming(failedPath, { ...event, stage: 'pen-review-frame', verdict });
    const failed = JSON.parse(readFileSync(failedPath, 'utf8').split('\n')[0]);
    assert.equal(failed.outcome, 'failed', String(verdict));
  }
});
