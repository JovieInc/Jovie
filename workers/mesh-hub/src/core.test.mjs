import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { test } from 'node:test';
import {
  HubError,
  LIMITS,
  MailboxStore,
  percentile,
  project,
  sha256Hex,
  validateSend,
} from './core.ts';
import { backoffFor, isOpen, Outbox } from './outbox.ts';
import {
  evaluatePresence,
  evaluateProbe,
  lastAlive,
  PROBE,
} from './presence.ts';
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

test('presence: silence after 2x heartbeat, one event per transition, dormant agents never alarm', () => {
  const base = {
    now: 1_000_000,
    heartbeatSec: 20,
    state: 'ok',
    lastSeenAt: null,
    connected: 1,
    lastPingAt: null,
    lastActivityAt: null,
  };
  assert.equal(lastAlive({ ...base, lastSeenAt: 5, lastPingAt: 9 }), 9);
  assert.equal(lastAlive(base), null);
  const silent = evaluatePresence({ ...base, lastPingAt: base.now - 41_000 });
  assert.deepEqual([silent.state, silent.event], ['silent', 'agent.silent']);
  const still = evaluatePresence({
    ...base,
    state: 'silent',
    lastPingAt: base.now - 90_000,
  });
  assert.equal(still.event, null, 'no repeat alarm while silent');
  const ok = evaluatePresence({ ...base, lastPingAt: base.now - 39_000 });
  assert.deepEqual(
    [ok.state, ok.event],
    ['ok', null],
    'one missed ping is not silence'
  );
  const back = evaluatePresence({
    ...base,
    state: 'silent',
    lastActivityAt: base.now,
  });
  assert.equal(back.event, 'agent.recovered');
  assert.equal(
    evaluatePresence({ ...base, heartbeatSec: null }).state,
    'unknown'
  );
  assert.equal(
    evaluatePresence({ ...base, heartbeatSec: null, lastSeenAt: 1 }).event,
    null
  );
  assert.equal(
    evaluatePresence({ ...base, state: 'unknown' }).event,
    'agent.silent',
    'an open socket without pings is not alive'
  );
});

test('probe: first probe, ack with RTT, misses alarm once at the threshold, recovery event', () => {
  assert.deepEqual(
    evaluateProbe({
      now: 0,
      lastProbeAt: null,
      lastProbeAckAt: null,
      misses: 0,
    }),
    { misses: 0, rttMs: null, sendNew: true, event: null }
  );
  const acked = evaluateProbe({
    now: PROBE.intervalMs + 10,
    lastProbeAt: 10,
    lastProbeAckAt: 260,
    misses: 0,
  });
  assert.deepEqual(acked, {
    misses: 0,
    rttMs: 250,
    sendNew: true,
    event: null,
  });
  assert.equal(
    evaluateProbe({
      now: 1_000,
      lastProbeAt: 10,
      lastProbeAckAt: 260,
      misses: 0,
    }).sendNew,
    false
  );
  assert.equal(
    evaluateProbe({
      now: 1_000,
      lastProbeAt: 10,
      lastProbeAckAt: null,
      misses: 0,
    }).sendNew,
    false,
    'inside the miss window'
  );
  const miss1 = evaluateProbe({
    now: PROBE.missAfterMs + 20,
    lastProbeAt: 10,
    lastProbeAckAt: null,
    misses: 0,
  });
  assert.deepEqual([miss1.misses, miss1.event, miss1.sendNew], [1, null, true]);
  const miss2 = evaluateProbe({
    now: PROBE.missAfterMs + 20,
    lastProbeAt: 10,
    lastProbeAckAt: 5,
    misses: 1,
  });
  assert.deepEqual([miss2.misses, miss2.event], [2, 'agent.unreachable']);
  assert.equal(
    evaluateProbe({
      now: PROBE.missAfterMs + 20,
      lastProbeAt: 10,
      lastProbeAckAt: null,
      misses: 2,
    }).event,
    null,
    'alarm fires once'
  );
  assert.equal(
    evaluateProbe({ now: 100, lastProbeAt: 10, lastProbeAckAt: 50, misses: 3 })
      .event,
    'agent.reachable'
  );
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
