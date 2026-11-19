import assert from 'node:assert/strict';
import { test } from 'node:test';
import { classifyEnvelope, LIMITS, MailboxStore } from './core.ts';
import {
  boardEnvelope,
  EMPTY_SELECTOR,
  envelope,
  sqlite,
} from './test-fixture.mjs';

test('classifyEnvelope: board fan-outs and machine envelopes are automated; peer mail and TIM-RELAY are direct', async () => {
  assert.equal(
    classifyEnvelope(await boardEnvelope()),
    'automated',
    'board offer/re-offer fan-outs are automated'
  );
  assert.equal(
    classifyEnvelope(
      await boardEnvelope({
        id: 'board:t:t-9:2',
        correlationId: 't:t-9:2',
        event: 'task.reopened',
      })
    ),
    'automated'
  );
  assert.equal(
    classifyEnvelope(
      await boardEnvelope({
        id: 'board:t:t-8:3',
        correlationId: 't:t-8:3',
        event: 'merge.open',
      })
    ),
    'automated'
  );
  assert.equal(
    classifyEnvelope(
      await boardEnvelope({
        id: 'board:t:t-7:4',
        correlationId: 't:t-7:4',
        event: 'question.open',
      })
    ),
    'direct',
    'board questions are never expired merely because the sender is the board'
  );
  assert.equal(
    classifyEnvelope(
      await boardEnvelope({
        id: 'board:t:t-6:5',
        correlationId: 't:t-6:5',
        event: 'question.answered',
      })
    ),
    'direct',
    'board answers stay direct'
  );
  assert.equal(
    classifyEnvelope(
      await boardEnvelope({
        id: 'board:t:t-5:6',
        correlationId: 't:t-5:6',
        event: 'task.done',
      })
    ),
    'direct',
    'board results stay direct'
  );
  assert.equal(
    classifyEnvelope(
      await boardEnvelope({
        id: 'board:t:t-4:7',
        correlationId: 't:t-4:7',
        body: 'plain text, not board JSON',
      })
    ),
    'direct',
    'unparseable board bodies are ambiguous and stay direct'
  );
  assert.equal(classifyEnvelope(await envelope()), 'direct');
  assert.equal(
    classifyEnvelope(
      await envelope({ kind: 'event', correlationId: 'mesh-evt-00001' })
    ),
    'automated'
  );
  assert.equal(
    classifyEnvelope(
      await envelope({
        kind: 'probe',
        from: 'mesh-probe',
        correlationId: 'probe:1',
      })
    ),
    'automated'
  );
  assert.equal(
    classifyEnvelope(
      await envelope({
        kind: 'undeliverable',
        from: 'mesh-hub',
        correlationId: 'dlq:x:1',
      })
    ),
    'automated'
  );
  assert.equal(
    classifyEnvelope(await envelope({ body: 'escalate TIM-RELAY JOV-1' })),
    'direct',
    'the TIM-RELAY marker protects the body'
  );
  assert.equal(
    classifyEnvelope(await envelope({ refs: ['TIM-RELAY:JOV-1'] })),
    'direct',
    'the TIM-RELAY marker protects refs'
  );
  assert.equal(
    classifyEnvelope(
      await envelope({
        kind: 'undeliverable',
        from: 'mesh-hub',
        correlationId: 'dlq:y:2',
        body: '{"quotedBody":"TIM-RELAY note"}',
      })
    ),
    'direct',
    'a quoted TIM-RELAY copy stays protected'
  );
});

test('sweepExpired auto-acks unhandled automated notices past the TTL and drops their bodies; direct mail survives', async () => {
  const store = new MailboxStore(sqlite());
  const notice = await boardEnvelope({ acceptedAt: 1_000 });
  const event = await envelope({
    kind: 'event',
    correlationId: 'mesh-evt-00001',
    acceptedAt: 1_000,
  });
  const direct = await envelope({ acceptedAt: 1_000 });
  store.enqueue(notice);
  store.enqueue(event);
  store.enqueue(direct);
  const ttl = LIMITS.autoNoticeTtlMs;
  const expired = store.sweepExpired(1_000 + ttl + 1, ttl);
  assert.deepEqual(
    expired.map(m => m.id).sort(),
    [notice.id, event.id].sort(),
    'the board notice and the event expire; the direct message does not'
  );
  assert.equal(store.unackedCount(), 1, 'only the direct message still counts');
  assert.deepEqual(
    store.claim(1_000 + ttl + 2).map(m => m.id),
    [direct.id],
    'the direct message is untouched and claimable'
  );
  // Expired rows keep id + digest for replay but lose the body, like retention.
  assert.deepEqual(store.enqueue(notice), { ok: true, seq: 1, replay: true });
  assert.equal(
    store.history(0).some(m => m.id === notice.id),
    false,
    'expired body dropped from history'
  );
});

test('expired acks carry their reason', async () => {
  const sql = sqlite();
  const store = new MailboxStore(sql);
  const notice = await boardEnvelope({ acceptedAt: 0 });
  const direct = await envelope({ acceptedAt: 0 });
  store.enqueue(notice);
  store.enqueue(direct);
  store.sweepExpired(LIMITS.autoNoticeTtlMs + 1, LIMITS.autoNoticeTtlMs);
  store.ack([direct.id], LIMITS.autoNoticeTtlMs + 2);
  assert.deepEqual(
    sql
      .exec('SELECT id, ack_reason FROM messages WHERE acked_at IS NOT NULL')
      .toArray()
      .map(row => [row.id, row.ack_reason]),
    [
      [notice.id, 'expired'],
      [direct.id, null],
    ]
  );
});

test('automated notices never die and never reach the DLQ; their TTL handles them', async () => {
  const store = new MailboxStore(sqlite());
  const notice = await boardEnvelope({ acceptedAt: 0 });
  store.enqueue(notice);
  assert.equal(
    store.sweepDead(LIMITS.deadAfterActiveMs + 1, LIMITS.deadAfterActiveMs)
      .length,
    0,
    'a board fan-out is never flagged dead'
  );
  const expired = store.sweepExpired(
    LIMITS.autoNoticeTtlMs + 1,
    LIMITS.autoNoticeTtlMs
  );
  assert.deepEqual(
    expired.map(m => m.id),
    [notice.id]
  );
  assert.equal(
    store.sweepDead(LIMITS.autoNoticeTtlMs + 2, LIMITS.deadAfterActiveMs)
      .length,
    0,
    'expired mail cannot be dead-lettered'
  );
});

test('peek returns metadata only and never claims a lease or changes state', async () => {
  const store = new MailboxStore(sqlite());
  for (let i = 1; i <= 3; i++)
    store.enqueue(
      await envelope({ correlationId: `mesh-000${i}-test`, acceptedAt: i })
    );
  store.ack(['claude:mesh-0002-test'], 4_000);
  const out = store.peek(EMPTY_SELECTOR, 5_000);
  assert.equal(out.messages.length, 3);
  assert.equal(out.nextAfter, null, 'a non-full page has no continuation');
  const row = out.messages[0];
  assert.deepEqual(Object.keys(row).sort(), [
    'acceptedAt',
    'acked',
    'bodyLength',
    'correlationId',
    'from',
    'id',
    'kind',
    'preview',
    'refs',
    'sentAt',
    'seq',
  ]);
  assert.equal(row.acked, false);
  assert.equal(row.bodyLength, 'status ping'.length);
  assert.equal(row.preview, 'status ping');
  assert.equal(out.messages[1].acked, true);
  // No side effects: peek claims nothing, so both unacked messages still claim.
  const claimed = store.claim(5_001);
  assert.deepEqual(
    claimed.map(m => m.seq),
    [1, 3]
  );
  assert.deepEqual(
    claimed.map(m => m.deliveryCount),
    [1, 1],
    'peek did not bump delivery counts'
  );
  const paged = store.peek({ ...EMPTY_SELECTOR, limit: 2 }, 5_002);
  assert.deepEqual(
    paged.messages.map(m => m.seq),
    [1, 2]
  );
  assert.equal(paged.nextAfter, 2, 'a full page continues from its last seq');
  assert.deepEqual(
    store
      .peek({ ...EMPTY_SELECTOR, afterSeq: paged.nextAfter }, 5_003)
      .messages.map(m => m.seq),
    [3]
  );
});

test('peek filters: unackedOnly, msgKind, from and time windows', async () => {
  const store = new MailboxStore(sqlite());
  const old = await boardEnvelope({
    id: 'board:t:old:1',
    correlationId: 't:old:1',
    acceptedAt: 0,
  });
  const fresh = await boardEnvelope({
    id: 'board:t:fresh:1',
    correlationId: 't:fresh:1',
    acceptedAt: 50_000,
  });
  const event = await envelope({
    kind: 'event',
    correlationId: 'mesh-evt-00001',
    acceptedAt: 50_000,
  });
  store.enqueue(old);
  store.enqueue(fresh);
  store.enqueue(event);
  const base = { ...EMPTY_SELECTOR };
  assert.deepEqual(
    store.peek({ ...base, unackedOnly: true }, 50_100).messages.map(m => m.seq),
    [1, 2, 3]
  );
  store.ack([fresh.id], 50_200);
  assert.deepEqual(
    store.peek({ ...base, unackedOnly: true }, 50_300).messages.map(m => m.seq),
    [1, 3]
  );
  assert.deepEqual(
    store
      .peek({ ...base, msgKinds: ['event'] }, 50_300)
      .messages.map(m => m.seq),
    [3]
  );
  assert.deepEqual(
    store.peek({ ...base, from: ['board'] }, 50_300).messages.map(m => m.seq),
    [1, 2]
  );
  assert.deepEqual(
    store
      .peek({ ...base, olderThanMs: 20_000 }, 50_300)
      .messages.map(m => m.seq),
    [1],
    'olderThanMs keeps only messages older than the window'
  );
  assert.deepEqual(
    store
      .peek({ ...base, newerThanMs: 20_000 }, 50_300)
      .messages.map(m => m.seq),
    [2, 3],
    'newerThanMs keeps only messages newer than the window'
  );
});

test('bulkAck acks exactly the unacked selector matches with reason admin-bulk-ack; excludes are case-insensitive', async () => {
  const sql = sqlite();
  const store = new MailboxStore(sql);
  const noticeA = await boardEnvelope({
    id: 'board:t:walk:1',
    correlationId: 't:walk:1',
    acceptedAt: 0,
  });
  const noticeB = await boardEnvelope({
    id: 'board:t:keep:2',
    correlationId: 't:keep:2',
    body: '{"title":"KEEP THIS"}',
    acceptedAt: 0,
  });
  const event = await envelope({
    kind: 'event',
    from: 'mesh-hub',
    correlationId: 'mesh-evt-00001',
    acceptedAt: 0,
  });
  const direct = await envelope({ acceptedAt: 0 });
  store.enqueue(noticeA);
  store.enqueue(noticeB);
  store.enqueue(event);
  store.enqueue(direct);
  const base = {
    ...EMPTY_SELECTOR,
    limit: 5_000,
  };
  const first = store.bulkAck(
    { ...base, msgKinds: ['message', 'event'], excludeFrom: ['claude'] },
    5_000,
    1_000
  );
  assert.equal(first.matched, 3, 'board notices and the event match');
  assert.equal(first.acked, 3);
  assert.deepEqual(
    first.manifest.map(m => m.seq),
    [1, 2, 3]
  );
  assert.ok(first.manifest.every(m => typeof m.preview === 'string'));
  assert.deepEqual(
    sql
      .exec(
        'SELECT DISTINCT ack_reason FROM messages WHERE acked_at IS NOT NULL'
      )
      .toArray()
      .map(row => row.ack_reason),
    ['admin-bulk-ack']
  );
  // Idempotent: the same filter selects nothing new; the direct message stays.
  const again = store.bulkAck(
    { ...base, msgKinds: ['message', 'event'], excludeFrom: ['claude'] },
    5_000,
    2_000
  );
  assert.deepEqual([again.matched, again.acked], [0, 0]);
  assert.equal(store.unackedCount(), 1);
});

test('bulkAck excludes match case-insensitively on body and refs, and excludeFrom is exact', async () => {
  const store = new MailboxStore(sqlite());
  const noisy = await boardEnvelope({
    id: 'board:t:noise:1',
    correlationId: 't:noise:1',
    body: '{"title":"Red-team walk"}',
    acceptedAt: 0,
  });
  const refFlagged = await boardEnvelope({
    id: 'board:t:ref:2',
    correlationId: 't:ref:2',
    refs: ['JOV-1234'],
    acceptedAt: 0,
  });
  const fromBoard = await boardEnvelope({
    id: 'board:t:from:3',
    correlationId: 't:from:3',
    acceptedAt: 0,
  });
  const fromClaude = await envelope({ acceptedAt: 0 });
  store.enqueue(noisy);
  store.enqueue(refFlagged);
  store.enqueue(fromBoard);
  store.enqueue(fromClaude);
  const base = {
    afterSeq: 0,
    limit: 5_000,
    olderThanMs: null,
    newerThanMs: null,
    msgKinds: [],
    from: [],
    unackedOnly: true,
    excludeBodyContains: [],
    excludeRefsContains: [],
    excludeFrom: [],
  };
  const out = store.bulkAck(
    {
      ...base,
      excludeBodyContains: ['RED-TEAM'],
      excludeRefsContains: ['jov-1234'],
      excludeFrom: ['claude'],
    },
    5_000,
    1_000
  );
  assert.deepEqual(
    out.manifest.map(m => m.seq),
    [3],
    'only the clean board notice matches'
  );
  assert.equal(out.acked, 1);
});
