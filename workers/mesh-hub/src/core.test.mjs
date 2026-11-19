import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { test } from 'node:test';
import {
  classifyEnvelope,
  dlqFallbackFull,
  HubError,
  isDlqSummaryDue,
  LIMITS,
  MailboxStore,
  nextDlqAccumulator,
  percentile,
  project,
  sha256Hex,
  validateSend,
} from './core.ts';
import { backoffFor, isOpen, Outbox } from './outbox.ts';
import { scanBody } from './scan.ts';

/** node:sqlite with the DO SqlStorage call shape. */
export function sqlite() {
  const db = new DatabaseSync(':memory:');
  return {
    exec(query, ...bindings) {
      const statement = db.prepare(query);
      const rows = /^\s*(SELECT|WITH)\b|\bRETURNING\b/i.test(query)
        ? statement.all(...bindings)
        : (statement.run(...bindings), []);
      return { toArray: () => rows.map(row => ({ ...row })) };
    },
  };
}

async function envelope(over = {}) {
  const body = over.body ?? 'status ping';
  return {
    id: `claude:${over.correlationId ?? 'mesh-0001-test'}`,
    from: 'claude',
    to: 'codex',
    correlationId: over.correlationId ?? 'mesh-0001-test',
    sha256: await sha256Hex(body),
    body,
    refs: [],
    inReplyTo: null,
    sentAt: null,
    acceptedAt: over.acceptedAt ?? 1_000,
    kind: over.kind ?? 'message',
    ...over,
    ...(over.body ? { sha256: await sha256Hex(over.body) } : {}),
  };
}

test('validateSend accepts a well-formed message and rejects each bad field with a fixed code', async () => {
  const body = 'hello mesh';
  const ok = {
    to: 'summer',
    correlationId: 'mesh-abcdefgh',
    sha256: await sha256Hex(body),
    body,
    refs: ['JOV-1'],
  };
  assert.equal((await validateSend(ok)).to, 'summer');
  const code = async input => {
    try {
      await validateSend(input);
      return 'ok';
    } catch (error) {
      assert.ok(error instanceof HubError);
      return error.code;
    }
  };
  assert.equal(await code(null), 'invalid_json');
  assert.equal(await code([]), 'invalid_json');
  assert.equal(await code({ ...ok, extra: 1 }), 'invalid_mesh_message');
  assert.equal(await code({ ...ok, to: 'Not A Kind' }), 'invalid_recipient');
  assert.equal(
    await code({ ...ok, correlationId: 'short' }),
    'invalid_mesh_message'
  );
  assert.equal(await code({ ...ok, body: ' ' }), 'body_too_large');
  assert.equal(
    await code({ ...ok, body: 'x'.repeat(LIMITS.bodyChars + 1) }),
    'body_too_large'
  );
  assert.equal(await code({ ...ok, sha256: 'zz' }), 'invalid_mesh_message');
  assert.equal(
    await code({ ...ok, sha256: '0'.repeat(64) }),
    'digest_mismatch'
  );
  assert.equal(
    await code({ ...ok, refs: Array(9).fill('a') }),
    'invalid_mesh_message'
  );
  assert.equal(await code({ ...ok, refs: 'JOV-1' }), 'invalid_mesh_message');
  assert.equal(await code({ ...ok, inReplyTo: 5 }), 'invalid_mesh_message');
  assert.equal(
    await code({ ...ok, sentAt: 'x'.repeat(41) }),
    'invalid_mesh_message'
  );
  assert.equal(
    (
      await validateSend({
        ...ok,
        to: 'all',
        inReplyTo: 'claude:x',
        sentAt: '2026-10-31T00:00:00Z',
      })
    ).inReplyTo,
    'claude:x'
  );
});

test('enqueue is idempotent on id+digest, conflicts on a changed digest, and seq never repeats', async () => {
  const store = new MailboxStore(sqlite());
  const first = store.enqueue(await envelope());
  assert.deepEqual(first, { ok: true, seq: 1, replay: false });
  assert.deepEqual(store.enqueue(await envelope()), {
    ok: true,
    seq: 1,
    replay: true,
  });
  const conflict = store.enqueue(await envelope({ body: 'different body' }));
  assert.equal(conflict.ok, false);
  assert.equal(conflict.status, 409);
  const second = store.enqueue(
    await envelope({ correlationId: 'mesh-0002-test' })
  );
  assert.equal(second.seq, 2);
});

test('claim leases unhandled messages; an unacked low seq is redelivered after the lease, never skipped', async () => {
  const store = new MailboxStore(sqlite());
  for (const n of [1, 2, 3])
    store.enqueue(await envelope({ correlationId: `mesh-000${n}-test` }));
  const first = store.claim(10_000);
  assert.deepEqual(
    first.map(m => m.seq),
    [1, 2, 3]
  );
  assert.equal(first[0].deliveryCount, 1);
  assert.equal(
    store.claim(10_001).length,
    0,
    'leased messages are hidden from a second reader'
  );
  store.ack(['claude:mesh-0002-test', 'claude:mesh-0003-test'], 10_002);
  const again = store.claim(10_000 + LIMITS.leaseMs + 1);
  assert.deepEqual(
    again.map(m => m.seq),
    [1],
    'seq 1 comes back even though 2 and 3 were acked'
  );
  assert.equal(again[0].deliveryCount, 2);
  assert.deepEqual(store.ack(['claude:mesh-0001-test', 'unknown:id'], 20_000), {
    acked: 1,
  });
  assert.deepEqual(
    store.ack(['claude:mesh-0001-test'], 20_001),
    { acked: 0 },
    'ack is idempotent'
  );
  assert.equal(store.unackedCount(), 0);
});

test('receipt is stage 1 only: a received message still counts as unhandled until acked', async () => {
  const store = new MailboxStore(sqlite());
  store.enqueue(await envelope());
  assert.equal(store.unreceived(2_000).length, 1);
  assert.deepEqual(store.receipt(['claude:mesh-0001-test'], 2_500).received, 1);
  assert.equal(store.receipt(['claude:mesh-0001-test'], 2_600).received, 0);
  assert.equal(store.unreceived(3_000).length, 0);
  assert.equal(store.unackedCount(), 1);
  assert.equal(store.oldestUnacked().id, 'claude:mesh-0001-test');
  const sample = store.latencies(0);
  assert.deepEqual(sample.toReceived, [1_500]);
  assert.deepEqual(sample.toHandled, []);
  assert.equal(sample.unhandled, 1);
});

test('probes are ephemeral: a new probe supersedes the old one and a receipt completes it', async () => {
  const store = new MailboxStore(sqlite());
  store.enqueue(
    await envelope({
      id: 'mesh-probe:codex:1',
      from: 'mesh-probe',
      correlationId: 'probe:1',
      kind: 'probe',
      acceptedAt: 1,
    })
  );
  store.enqueue(
    await envelope({
      id: 'mesh-probe:codex:2',
      from: 'mesh-probe',
      correlationId: 'probe:2',
      kind: 'probe',
      acceptedAt: 2,
    })
  );
  assert.deepEqual(
    store.unreceived(3).map(m => m.id),
    ['mesh-probe:codex:2']
  );
  assert.equal(store.claim(3).length, 0, 'agent reads never see probes');
  const { probes } = store.receipt(['mesh-probe:codex:2'], 50);
  assert.equal(probes.length, 1);
  assert.deepEqual(store.lastProbe(), { acceptedAt: 2, receivedAt: 50 });
  assert.equal(store.unackedCount(), 0);
  assert.equal(
    store.latencies(0).accepted,
    0,
    'probes stay out of delivery metrics'
  );
});

test('sweepDead flags each unhandled message once and leaves it deliverable', async () => {
  const store = new MailboxStore(sqlite());
  store.enqueue(await envelope({ acceptedAt: 0 }));
  store.enqueue(
    await envelope({
      correlationId: 'mesh-evt-00001',
      kind: 'event',
      acceptedAt: 0,
    })
  );
  const dead = store.sweepDead(
    LIMITS.deadAfterActiveMs + 1,
    LIMITS.deadAfterActiveMs
  );
  assert.deepEqual(
    dead.map(m => m.id),
    ['claude:mesh-0001-test'],
    'events never die'
  );
  assert.equal(
    store.sweepDead(LIMITS.deadAfterActiveMs + 2, LIMITS.deadAfterActiveMs)
      .length,
    0
  );
  const claimed = store.claim(LIMITS.deadAfterActiveMs + 3);
  assert.ok(
    claimed.some(m => m.id === 'claude:mesh-0001-test' && m.deadAt !== null)
  );
  assert.equal(project(claimed[0]).dataNotInstructions, true);
  assert.equal(store.latencies(0).dead, 1);
});

test('purge drops bodies after retention but a late retry still replays', async () => {
  const store = new MailboxStore(sqlite());
  store.enqueue(await envelope());
  store.ack(['claude:mesh-0001-test'], 1_000);
  assert.equal(store.history(0).length, 1);
  assert.equal(store.purge(1_000 + LIMITS.retentionAfterAckMs + 1), 1);
  assert.equal(store.history(0).length, 0);
  assert.deepEqual(store.enqueue(await envelope()), {
    ok: true,
    seq: 1,
    replay: true,
  });
});

test('a full mailbox reports a retryable 507 instead of dropping', async () => {
  const store = new MailboxStore(sqlite());
  store.unackedCount = () => LIMITS.unackedPerMailbox;
  const result = store.enqueue(await envelope());
  assert.deepEqual(result, {
    ok: false,
    status: 507,
    code: 'mailbox_full',
    retryable: true,
  });
});

test('control-plane events keep headroom above the message quota, and history pages by seq', async () => {
  const store = new MailboxStore(sqlite());
  store.unackedCount = () => LIMITS.unackedPerMailbox;
  const event = { ...(await envelope()), kind: 'event' };
  assert.equal(
    store.enqueue(event).ok,
    true,
    'an event fits past the message quota'
  );
  store.unackedCount = () => LIMITS.unackedPerMailbox * 2;
  assert.equal(
    store.enqueue({
      ...event,
      id: 'claude:mesh-0002-test',
      sha256: 'b'.repeat(64),
    }).code,
    'mailbox_full'
  );

  const paged = new MailboxStore(sqlite());
  for (let i = 1; i <= 3; i++) {
    paged.enqueue({
      ...(await envelope()),
      id: `claude:mesh-000${i}-test`,
      sha256: String(i).repeat(64),
    });
  }
  const first = paged.history(0, 2);
  assert.equal(first.length, 2);
  const rest = paged.history(0, 2, first.at(-1).seq);
  assert.deepEqual(
    [...first, ...rest].map(m => m.id),
    ['claude:mesh-0001-test', 'claude:mesh-0002-test', 'claude:mesh-0003-test']
  );
});

test('meta round-trips and deletes', () => {
  const store = new MailboxStore(sqlite());
  assert.equal(store.getMeta('k'), null);
  store.setMeta('k', 'v1');
  store.setMeta('k', 'v2');
  assert.equal(store.getMeta('k'), 'v2');
  store.setMeta('k', null);
  assert.equal(store.getMeta('k'), null);
});

test('outbox commits an intent once, replays it, conflicts on a new digest and enforces the daily budget', async () => {
  const outbox = new Outbox(sqlite());
  const env = await envelope();
  const first = outbox.commit(env, ['codex', 'summer'], 5_000);
  assert.equal(first.ok, true);
  assert.equal(first.replay, false);
  assert.equal(first.intent.recipients.every(isOpen), true);
  const replay = outbox.commit(env, ['codex', 'summer', 'lola'], 6_000);
  assert.equal(replay.replay, true);
  assert.deepEqual(
    replay.intent.recipients.map(r => r.to),
    ['codex', 'summer'],
    'recipients resolved once'
  );
  const conflict = outbox.commit(
    await envelope({ body: 'other' }),
    ['codex'],
    6_000
  );
  assert.deepEqual(conflict, {
    ok: false,
    status: 409,
    code: 'correlation_conflict',
  });
  first.intent.recipients[0].state = 'stored';
  outbox.update(first.intent, 7_000);
  assert.equal(outbox.open().length, 1);
  first.intent.recipients[1].state = 'replay';
  outbox.update(first.intent, 7_001);
  assert.equal(outbox.open().length, 0);
  assert.equal(outbox.sentToday(7_002), 2);
  const many = Array.from(
    { length: LIMITS.sendsPerSenderPerDay },
    (_, i) => `k${i}`
  );
  assert.deepEqual(
    outbox.commit(
      await envelope({ correlationId: 'mesh-budget-01' }),
      many,
      7_003
    ),
    {
      ok: false,
      status: 429,
      code: 'daily_mesh_budget_exhausted',
    }
  );
  assert.equal(outbox.get('missing'), null);
});

test('scheduler keeps one alarm: min(due) across tasks, reschedule replaces', () => {
  const outbox = new Outbox(sqlite());
  assert.equal(outbox.nextDue(), null);
  outbox.schedule('sweep', 500);
  outbox.schedule('fanout', 100);
  outbox.schedule('fanout', 300);
  assert.equal(outbox.nextDue(), 100, 'schedule keeps the earliest');
  outbox.reschedule('fanout', 400);
  assert.equal(outbox.nextDue(), 400);
  assert.deepEqual(outbox.dueTasks(450), ['fanout']);
  outbox.schedule('fanout', null);
  assert.equal(outbox.nextDue(), 500);
  assert.equal(backoffFor(0), 2_000);
  assert.equal(backoffFor(99), 600_000);
});

test('scan rejects secrets and personal data, allows company addresses and ordinary text', () => {
  assert.deepEqual(
    scanBody('PR #23771 merged; see JOV-10028 and jovie-mesh-hub.'),
    { ok: true }
  );
  assert.deepEqual(scanBody('reach me at ops@jov.ie'), { ok: true });
  assert.equal(scanBody('key ghp_' + 'a'.repeat(36)).code, 'secret_rejected');
  assert.equal(
    scanBody('-----BEGIN RSA PRIVATE KEY-----').code,
    'secret_rejected'
  );
  assert.equal(
    scanBody('Authorization: Bearer ' + 'x'.repeat(40)).code,
    'secret_rejected'
  );
  assert.equal(scanBody('token=abcdefghijklmnop').code, 'secret_rejected');
  assert.equal(scanBody('call 415-555-0134').code, 'personal_data_rejected');
  assert.equal(
    scanBody('mail someone@gmail.com').code,
    'personal_data_rejected'
  );
});

test('percentile uses nearest-rank and handles empty input', () => {
  assert.equal(percentile([], 50), null);
  assert.equal(
    percentile([12, 17, 18, 19, 20, 23, 27, 28, 31, 36, 37], 50),
    23
  );
  assert.equal(
    percentile([12, 17, 18, 19, 20, 23, 27, 28, 31, 36, 37], 95),
    37
  );
});

test('clearDead un-flags a message so a failed dead-letter notification is retried', async () => {
  const store = new MailboxStore(sqlite());
  store.enqueue(await envelope({ acceptedAt: 0 }));
  const first = store.sweepDead(
    LIMITS.deadAfterActiveMs + 2,
    LIMITS.deadAfterActiveMs
  );
  assert.equal(first.length, 1);
  assert.equal(
    store.sweepDead(LIMITS.deadAfterActiveMs + 3, LIMITS.deadAfterActiveMs)
      .length,
    0,
    'dead once'
  );
  store.clearDead(first[0].seq);
  assert.equal(
    store.sweepDead(LIMITS.deadAfterActiveMs + 4, LIMITS.deadAfterActiveMs)
      .length,
    1,
    'retried after clearDead'
  );
});

/** A board fan-out notice: kind 'message' from 'board' (the noise amplifier). */
async function boardEnvelope(over = {}) {
  const body = over.body ?? '{"schema":"jovie.board/v1","event":"task.open"}';
  return {
    id: over.id ?? 'board:t:t-1:1',
    from: 'board',
    to: 'claude',
    correlationId: over.correlationId ?? 't:t-1:1',
    sha256: await sha256Hex(body),
    body,
    refs: over.refs ?? [],
    inReplyTo: null,
    sentAt: null,
    acceptedAt: over.acceptedAt ?? 1_000,
    kind: 'message',
  };
}

const EMPTY_SELECTOR = {
  afterSeq: 0,
  limit: 100,
  olderThanMs: null,
  newerThanMs: null,
  msgKinds: [],
  from: [],
  unackedOnly: false,
  excludeBodyContains: [],
  excludeRefsContains: [],
  excludeFrom: [],
};

test('classifyEnvelope: board fan-outs and machine envelopes are automated; peer mail and TIM-RELAY are direct', async () => {
  assert.equal(
    classifyEnvelope(await boardEnvelope()),
    'automated',
    'board offers/re-offers/task notices are automated'
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
