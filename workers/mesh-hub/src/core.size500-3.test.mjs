import assert from 'node:assert/strict';
import { test } from 'node:test';
import { LIMITS } from './core.ts';
import {
  dlqFallbackFull,
  isDlqSummaryDue,
  nextDlqAccumulator,
} from './envelope-policy.ts';
import {
  boardEnvelope,
  EMPTY_SELECTOR,
  envelope,
  sqlite,
} from './fixtures/test-fixture.mjs';
import { MailboxStore } from './mailbox-store.ts';

test('bulkAck caps ids per call', async () => {
  const store = new MailboxStore(sqlite());
  for (let i = 1; i <= 6; i++)
    store.enqueue(
      await envelope({ correlationId: `mesh-000${i}-test`, acceptedAt: 0 })
    );
  const out = store.bulkAck({ ...EMPTY_SELECTOR, unackedOnly: true }, 4, 1_000);
  assert.deepEqual([out.matched, out.acked], [4, 4]);
  assert.equal(
    store.bulkAck({ ...EMPTY_SELECTOR, unackedOnly: true }, 4, 2_000).acked,
    2
  );
});

test('DLQ coalescing accumulates a window and emits one due summary with count + first/last seq', () => {
  const store = new MailboxStore(sqlite());
  const windowMs = LIMITS.dlqCoalesceMs;
  store.recordDlqDead('claude', 'summer', 1, 1_000, windowMs);
  assert.equal(
    store.pendingDlqSummary('claude', 'summer', 1_001, windowMs),
    null,
    'not due inside the window'
  );
  for (let seq = 2; seq <= 5; seq++)
    store.recordDlqDead('claude', 'summer', seq, 1_000 + seq, windowMs);
  const summary = store.pendingDlqSummary(
    'claude',
    'summer',
    1_000 + windowMs,
    windowMs
  );
  assert.deepEqual(summary, {
    windowStart: 1_000,
    count: 5,
    firstSeq: 1,
    lastSeq: 5,
  });
  store.clearDlqSummary('claude', 'summer');
  assert.equal(store.dlqPending('claude'), false);
  store.recordDlqDead('claude', 'summer', 6, 1_000 + windowMs + 1, windowMs);
  assert.equal(store.dlqPending('claude'), true);
  assert.deepEqual(
    store.pendingDlqSummary(
      'claude',
      'summer',
      1_000 + 2 * windowMs + 1,
      windowMs
    ),
    {
      windowStart: 1_000 + windowMs + 1,
      count: 1,
      firstSeq: 6,
      lastSeq: 6,
    },
    'a lapsed window restarts fresh'
  );
});

test('DLQ helpers: window rollover, due check and the full-fallback threshold', () => {
  const acc = nextDlqAccumulator(null, 7, 1_000, 60_000);
  assert.deepEqual(acc, {
    windowStart: 1_000,
    count: 1,
    firstSeq: 7,
    lastSeq: 7,
  });
  assert.deepEqual(nextDlqAccumulator(acc, 9, 2_000, 60_000), {
    windowStart: 1_000,
    count: 2,
    firstSeq: 7,
    lastSeq: 9,
  });
  assert.deepEqual(nextDlqAccumulator(acc, 11, 61_000, 60_000), {
    windowStart: 61_000,
    count: 1,
    firstSeq: 11,
    lastSeq: 11,
  });
  assert.equal(isDlqSummaryDue(acc, 60_999, 60_000), false);
  assert.equal(isDlqSummaryDue(acc, 61_000, 60_000), true);
  assert.equal(isDlqSummaryDue(null, 61_000, 60_000), false);
  assert.equal(
    dlqFallbackFull(null),
    false,
    'unknown fullness never counts as full'
  );
  assert.equal(dlqFallbackFull(8_999), false);
  assert.equal(dlqFallbackFull(9_000), true);
  assert.equal(dlqFallbackFull(LIMITS.unackedPerMailbox), true);
});

test('sweepExpired keeps board questions, answers and results; only offers expire', async () => {
  const store = new MailboxStore(sqlite());
  const offer = await boardEnvelope({
    id: 'board:t:o:1',
    correlationId: 't:o:1',
    acceptedAt: 0,
  });
  const answer = await boardEnvelope({
    id: 'board:t:q:2',
    correlationId: 't:q:2',
    event: 'question.answered',
    acceptedAt: 0,
  });
  store.enqueue(offer);
  store.enqueue(answer);
  const expired = store.sweepExpired(
    LIMITS.autoNoticeTtlMs + 1,
    LIMITS.autoNoticeTtlMs
  );
  assert.deepEqual(
    expired.map(m => m.id),
    [offer.id]
  );
  assert.equal(store.unackedCount(), 1, 'the answer notice survives the TTL');
});
