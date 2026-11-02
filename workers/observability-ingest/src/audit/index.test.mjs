import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { test } from 'node:test';

import worker, {
  handle,
  matchesTarget,
  retain,
  sanitizeEvent,
} from './index.ts';

const MIGRATION = new URL(
  '../../migrations/audit/0001_init.sql',
  import.meta.url
);

/** Minimal D1 stand-in over node:sqlite (same SQL dialect). */
function d1() {
  const db = new DatabaseSync(':memory:');
  db.exec(readFileSync(MIGRATION, 'utf8'));
  const stmt = (sql, args = []) => ({
    bind: (...a) => stmt(sql, a),
    first: async () => db.prepare(sql).get(...args) ?? null,
    all: async () => ({ results: db.prepare(sql).all(...args) }),
    run: async () => {
      const r = db.prepare(sql).run(...args);
      return { meta: { changes: Number(r.changes) } };
    },
  });
  return {
    prepare: sql => stmt(sql),
    batch: async list => Promise.all(list.map(s => s.run())),
    raw: db,
  };
}

function env(extra = {}) {
  return {
    AUDIT_DB: d1(),
    INGEST_HMAC_SECRET: 'hmac',
    READ_TOKEN: 'read',
    ...extra,
  };
}

function signed(path, body, secret = 'hmac') {
  const text = JSON.stringify(body);
  return new Request(`https://jovie-fleet-audit.tim-fd8.workers.dev${path}`, {
    method: 'POST',
    body: text,
    headers: {
      'x-fleet-audit-signature': `sha256=${createHmac('sha256', secret).update(text).digest('hex')}`,
    },
  });
}

const read = (path, token = 'read') =>
  new Request(`https://jovie-fleet-audit.tim-fd8.workers.dev${path}`, {
    headers: { authorization: `Bearer ${token}` },
  });

const ev = (over = {}) => ({
  id: '11111111-2222-3333-4444-555555555555',
  ts: '2026-10-29T00:23:44.000Z',
  actor_agent: 'claude',
  session_id: '7c39bc2f',
  host: 'tims-mbp',
  repo: 'JovieInc/Jovie',
  target: 'Lane Fix Relay',
  action: 'workflow.disable',
  danger: 1,
  reason: 'relay flood stopgap',
  issue: 'JOV-1',
  outcome: 'ok',
  before: 'active',
  after: 'disabled_manually',
  source: 'gh-shim',
  ...over,
});

test('rejects unsigned and wrongly signed writes', async () => {
  const e = env();
  const bad = await handle(signed('/v1/events', [ev()], 'nope'), e);
  assert.equal(bad.status, 401);
  const unsigned = await handle(
    new Request('https://jovie-fleet-audit.tim-fd8.workers.dev/v1/events', {
      method: 'POST',
      body: '[]',
    }),
    e
  );
  assert.equal(unsigned.status, 401);
});

test('ingest is idempotent and accounts bytes against the monthly budget', async () => {
  const e = env();
  const now = new Date('2026-10-29T01:00:00Z');
  let res = await handle(
    signed('/v1/events', [ev(), ev({ id: 'bad id!' })]),
    e,
    now
  );
  assert.equal(res.status, 202);
  const body = await res.json();
  assert.equal(body.accepted, 1);
  assert.equal(body.inserted, 1);
  res = await handle(signed('/v1/events', [ev()]), e, now);
  assert.equal((await res.json()).inserted, 0);
  const usage = e.AUDIT_DB.raw.prepare('SELECT * FROM usage').get();
  assert.equal(usage.month, '2026-10');
  assert.ok(usage.bytes > 200 && usage.bytes < 1200, `bytes ${usage.bytes}`);
});

test('who answers "who did X to Y, when and why" and needs the read token', async () => {
  const e = env();
  const now = new Date('2026-10-29T01:00:00Z');
  await handle(signed('/v1/events', [ev()]), e, now);
  assert.equal(
    (await handle(read('/v1/who?target=Relay', 'wrong'), e, now)).status,
    401
  );
  const res = await handle(read('/v1/who?target=Lane%20Fix&since=7d'), e, now);
  const body = await res.json();
  assert.equal(body.events.length, 1);
  assert.equal(body.events[0].actor_agent, 'claude');
  assert.equal(body.events[0].reason, 'relay flood stopgap');
});

test('snapshot diff attributes a workflow disable to the shim event, and flags unexplained ones', async () => {
  const e = env();
  const t0 = new Date('2026-10-29T00:00:00Z');
  await handle(signed('/v1/events', [ev()]), e, t0);
  const wf = state => ({
    kind: 'workflow',
    id: 368087390,
    name: 'Lane Fix Relay',
    path: '.github/workflows/lane-fix-relay.yml',
    state,
    updated_at: '2026-10-29T00:23:50Z',
  });
  let res = await handle(
    signed('/v1/snapshot', { repo: 'JovieInc/Jovie', items: [wf('active')] }),
    e,
    t0
  );
  assert.deepEqual((await res.json()).changes, []); // baseline
  res = await handle(
    signed('/v1/snapshot', {
      repo: 'JovieInc/Jovie',
      items: [wf('disabled_manually')],
    }),
    e,
    new Date('2026-10-29T01:00:00Z')
  );
  const [change] = (await res.json()).changes;
  assert.equal(change.status, 'attributed');
  assert.equal(change.matched_event_id, ev().id);

  const other = {
    kind: 'workflow',
    id: 1,
    name: 'Test',
    state: 'active',
    updated_at: '2026-10-29T02:00:00Z',
  };
  await handle(
    signed('/v1/snapshot', { repo: 'JovieInc/gbrain', items: [other] }),
    e,
    t0
  );
  res = await handle(
    signed('/v1/snapshot', {
      repo: 'JovieInc/gbrain',
      items: [{ ...other, state: 'disabled_manually' }],
    }),
    e,
    new Date('2026-10-29T02:30:00Z')
  );
  assert.equal((await res.json()).changes[0].status, 'unattributed');
  const sum = await (
    await handle(read('/v1/summary'), e, new Date('2026-10-29T03:00:00Z'))
  ).json();
  assert.equal(sum.unattributed.length, 1);
  assert.equal(sum.dangerous.length, 1);
});

test('github audit export rows are correlated', async () => {
  const e = env();
  await handle(signed('/v1/events', [ev()]), e);
  const res = await handle(
    signed('/v1/github-audit', [
      {
        action: 'workflows.disable_workflow',
        actor: 'itstimwhite',
        created_at: Date.parse('2026-10-29T00:23:45Z'),
        repo: 'JovieInc/Jovie',
        name: 'Lane Fix Relay',
      },
      {
        action: 'pull_request.merge',
        actor: 'itstimwhite',
        created_at: Date.parse('2026-10-29T00:20:00Z'),
        repo: 'JovieInc/Jovie',
      },
    ]),
    e
  );
  assert.deepEqual(await res.json(), {
    ok: true,
    attributed: 1,
    unattributed: 0,
  });
});

test('target matching uses id, name, or workflow file', () => {
  const it = {
    kind: 'workflow',
    id: 368087390,
    name: 'Lane Fix Relay',
    path: '.github/workflows/lane-fix-relay.yml',
  };
  assert.ok(
    matchesTarget(
      sanitizeEvent(
        ev({
          target: 'repos/JovieInc/Jovie/actions/workflows/368087390/disable',
        })
      ),
      it
    )
  );
  assert.ok(
    matchesTarget(sanitizeEvent(ev({ target: 'lane-fix-relay.yml' })), it)
  );
  assert.ok(!matchesTarget(sanitizeEvent(ev({ target: 'ci.yml' })), it));
});

test('retention archives to R2 before deleting, and never deletes without an archive', async () => {
  const e = env();
  const old = ev({
    id: 'aaaaaaaa-0000-0000-0000-000000000001',
    ts: '2026-07-01T00:00:00Z',
  });
  await handle(signed('/v1/events', [old, ev()]), e);
  const now = new Date('2026-10-29T03:23:00Z');
  assert.deepEqual(await retain(e, now), { archived: 0 });
  assert.equal(
    e.AUDIT_DB.raw.prepare('SELECT COUNT(*) AS n FROM events').get().n,
    2
  );
  const puts = [];
  e.ARCHIVE = {
    put: async (key, body) => puts.push({ key, size: body.byteLength }),
  };
  const out = await retain(e, now);
  assert.equal(out.archived, 1);
  assert.match(puts[0].key, /^fleet-audit\/archive\/2026-10-29-1\.ndjson\.gz$/);
  assert.equal(
    e.AUDIT_DB.raw.prepare('SELECT COUNT(*) AS n FROM events').get().n,
    1
  );
});

test('budget alarm fires once at 80%', async () => {
  const calls = [];
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), body: JSON.parse(init.body) });
    return new Response('{}', { status: 200 });
  };
  try {
    const e = env({
      BUDGET_BYTES_MONTH: '1000',
      MESH_TOKEN: 't',
      MESH_SENDER_ID: 's',
      MESH_SENDER_KIND: 'claude',
    });
    await handle(
      signed('/v1/events', [
        ev({ danger: 0 }),
        ev({ id: 'bbbbbbbb-0000-0000-0000-000000000002', danger: 0 }),
      ]),
      e
    );
    await handle(
      signed('/v1/events', [
        ev({ id: 'cccccccc-0000-0000-0000-000000000003', danger: 0 }),
      ]),
      e
    );
    const alarms = calls.filter(c => c.body.body.includes('budget alarm'));
    assert.equal(alarms.length, 1);
    assert.match(calls[0].url, /\/summer\/v1\/mesh\/inbox$/);
  } finally {
    globalThis.fetch = realFetch;
  }
});

test('scheduled handler runs the budget check without throwing', async () => {
  const e = env();
  await worker.scheduled(
    { scheduledTime: Date.parse('2026-10-29T05:23:00Z') },
    e
  );
  const health = await (
    await handle(
      new Request('https://jovie-fleet-audit.tim-fd8.workers.dev/healthz'),
      e
    )
  ).json();
  assert.equal(health.last_cron_at, '2026-10-29T05:23:00.000Z');
});
