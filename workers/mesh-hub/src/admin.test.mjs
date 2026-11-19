import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  adminMailboxRoute,
  isAdmin,
  parseBulkAckBody,
  parsePeekQuery,
} from './admin.ts';
import { LIMITS } from './core.ts';

const ADMIN_TOKEN = 'a'.repeat(40);
const OTHER_TOKEN = 'b'.repeat(40);

const adminRequest = (url, init = {}) =>
  new Request(url, {
    ...init,
    headers: { Authorization: `Bearer ${ADMIN_TOKEN}`, ...init.headers },
  });

test('admin auth: the exact HUB_ADMIN_TOKEN bearer passes; missing or wrong tokens fail', async () => {
  const peek = 'https://hub/v1/admin/mailbox/claude/peek';
  assert.equal(
    await isAdmin(new Request(peek), undefined),
    false,
    'no token configured: nothing is admin'
  );
  assert.equal(
    await isAdmin(new Request(peek), ADMIN_TOKEN),
    false,
    'no bearer header at all'
  );
  assert.equal(
    await isAdmin(
      new Request(peek, {
        headers: { Authorization: `Bearer ${OTHER_TOKEN}` },
      }),
      ADMIN_TOKEN
    ),
    false
  );
  assert.equal(await isAdmin(adminRequest(peek), ADMIN_TOKEN), true);
  // Short tokens do not even parse as a bearer credential.
  assert.equal(
    await isAdmin(
      new Request(peek, { headers: { Authorization: 'Bearer short' } }),
      'short'
    ),
    false
  );
});

test('peek parsing: defaults, caps and rejections', () => {
  const base = 'https://hub/v1/admin/mailbox/claude/peek';
  const defaults = parsePeekQuery(new URL(base));
  assert.deepEqual(
    [defaults.afterSeq, defaults.limit, defaults.unackedOnly],
    [0, LIMITS.pageSize, false]
  );
  const loaded = parsePeekQuery(
    new URL(
      `${base}?afterSeq=42&limit=999&olderThanMs=600000&newerThanMs=1000&msgKind=event&from=board&unackedOnly=1`
    )
  );
  assert.deepEqual(
    [loaded.afterSeq, loaded.limit, loaded.unackedOnly],
    [42, 200, true],
    'limit is capped at 200'
  );
  assert.deepEqual(loaded.msgKinds, ['event']);
  assert.deepEqual(loaded.from, ['board']);
  assert.equal(loaded.olderThanMs, 600_000);
  assert.equal(loaded.newerThanMs, 1_000);
  assert.throws(
    () => parsePeekQuery(new URL(`${base}?msgKind=nope`)),
    /invalid_query/
  );
  assert.throws(
    () => parsePeekQuery(new URL(`${base}?olderThanMs=-5`)),
    /invalid_query/
  );
  assert.throws(
    () => parsePeekQuery(new URL(`${base}?from=BAD KIND`)),
    /invalid_query/
  );
});

test('bulk-ack parsing: dryRun defaults true, maxIds caps at 5000, junk is rejected', () => {
  const parsed = parseBulkAckBody({
    filter: {
      msgKinds: ['message', 'event'],
      excludeBodyContains: ['Red-team'],
      excludeRefsContains: ['JOV-1'],
      excludeFrom: ['claude'],
      olderThanMs: 5000,
      newerThanMs: 100,
    },
  });
  assert.equal(parsed.dryRun, true, 'dry-run is the default');
  assert.equal(parsed.maxIds, 1000);
  assert.equal(
    parsed.filter.unackedOnly,
    true,
    'bulk-ack only ever targets unacked rows'
  );
  assert.deepEqual(parsed.filter.msgKinds, ['message', 'event']);
  assert.deepEqual(parsed.filter.excludeBodyContains, ['Red-team']);
  assert.equal(parseBulkAckBody({ dryRun: false }).dryRun, false);
  assert.equal(parseBulkAckBody({ maxIds: 99_999 }).maxIds, 5000);
  assert.throws(() => parseBulkAckBody({ maxIds: 0 }), /invalid_filter/);
  assert.equal(
    parseBulkAckBody({ filter: { from: ['board'] } }).filter.from.length,
    1
  );
  assert.throws(
    () => parseBulkAckBody({ filter: { msgKinds: ['nope'] } }),
    /invalid_filter/
  );
  assert.throws(
    () => parseBulkAckBody({ filter: { from: ['BAD KIND'] } }),
    /invalid_filter/
  );
  assert.throws(
    () =>
      parseBulkAckBody({ filter: { excludeBodyContains: ['x'.repeat(201)] } }),
    /invalid_filter/
  );
  assert.throws(() => parseBulkAckBody('nope'), /invalid_json/);
});

function fakeDeps() {
  const calls = { peek: [], bulkAck: [], events: [] };
  return {
    calls,
    deps: {
      mailbox: kind => ({
        peek: async selector => {
          calls.peek.push({ kind, selector });
          return {
            messages: [
              {
                seq: 12,
                id: 'board:t:red-1:3',
                from: 'board',
                kind: 'message',
                correlationId: 't:red-1:3',
                sentAt: null,
                acceptedAt: '2026-11-19T16:00:00.000Z',
                acked: false,
                bodyLength: 42,
                preview: '{"schema":"jovie.board/v1"',
                refs: [],
              },
            ],
            nextAfter: 12,
          };
        },
        bulkAck: async (selector, maxIds) => {
          calls.bulkAck.push({ kind, selector, maxIds });
          return {
            manifest: [
              {
                seq: 12,
                id: 'board:t:red-1:3',
                from: 'board',
                kind: 'message',
                correlationId: 't:red-1:3',
                acceptedAt: '2026-11-19T16:00:00.000Z',
                preview: 'x',
              },
            ],
            matched: 1,
            acked: 1,
          };
        },
      }),
      recordEvent: async (type, kind, detail) => {
        calls.events.push({ type, kind, detail });
      },
    },
  };
}

test('admin peek returns metadata, is read-only and caps the page', async () => {
  const { deps, calls } = fakeDeps();
  const url =
    'https://hub/v1/admin/mailbox/claude/peek?unackedOnly=1&limit=501&msgKind=message';
  const response = await adminMailboxRoute(
    new Request(url),
    new URL(url),
    'claude',
    deps
  );
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.ok, true);
  assert.equal(body.mailbox, 'claude');
  assert.equal(body.nextAfter, 12);
  assert.equal(body.messages[0].bodyLength, 42);
  assert.equal(body.messages[0].preview.length <= 120, true);
  assert.equal(calls.peek[0].selector.limit, 200, 'peek limit is capped');
  assert.equal(calls.peek[0].selector.unackedOnly, true);
  assert.equal(calls.bulkAck.length, 0, 'peek never acks');
  assert.equal(calls.events.length, 0, 'peek writes no audit event');
});

test('admin bulk-ack: dry-run acks nothing and audits nothing; a real run acks and audits once', async () => {
  const { deps, calls } = fakeDeps();
  const url = 'https://hub/v1/admin/mailbox/claude/bulk-ack';
  const dry = await adminMailboxRoute(
    new Request(url, {
      method: 'POST',
      body: JSON.stringify({ filter: { msgKinds: ['message'] } }),
    }),
    new URL(url),
    'claude',
    deps
  );
  const dryBody = await dry.json();
  assert.equal(dryBody.dryRun, true);
  assert.deepEqual(dryBody.counts, { matched: 1, acked: 0 });
  assert.ok(dryBody.manifest[0].id);
  assert.equal(calls.events.length, 0, 'dry-run writes no audit event');

  const real = await adminMailboxRoute(
    new Request(url, {
      method: 'POST',
      body: JSON.stringify({
        dryRun: false,
        filter: { excludeBodyContains: ['keep'] },
      }),
    }),
    new URL(url),
    'claude',
    deps
  );
  const realBody = await real.json();
  assert.equal(realBody.dryRun, false);
  assert.deepEqual(realBody.counts, { matched: 1, acked: 1 });
  assert.equal(calls.events.length, 1);
  assert.equal(calls.events[0].type, 'mailbox.bulk_ack');
  assert.equal(calls.events[0].kind, 'claude');
  assert.equal(calls.events[0].detail.who, 'admin');
  assert.equal(calls.events[0].detail.count, 1);
  assert.equal(calls.events[0].detail.firstSeq, 12);
  assert.equal(calls.events[0].detail.lastSeq, 12);
  assert.ok(JSON.parse(calls.events[0].detail.filter).excludeBodyContains);
});

test('admin mailbox routes reject bad kinds, unknown paths and wrong methods', async () => {
  const { deps } = fakeDeps();
  const badKind = 'https://hub/v1/admin/mailbox/BAD%20KIND/peek';
  assert.equal(
    (
      await adminMailboxRoute(
        new Request(badKind),
        new URL(badKind),
        'BAD KIND',
        deps
      )
    ).status,
    422
  );
  const unknown = 'https://hub/v1/admin/mailbox/claude/purge';
  assert.equal(
    (
      await adminMailboxRoute(
        new Request(unknown),
        new URL(unknown),
        'claude',
        deps
      )
    ).status,
    404
  );
  const peek = 'https://hub/v1/admin/mailbox/claude/peek';
  assert.equal(
    (
      await adminMailboxRoute(
        new Request(peek, { method: 'POST' }),
        new URL(peek),
        'claude',
        deps
      )
    ).status,
    404,
    'peek is GET-only'
  );
});
