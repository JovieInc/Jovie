import assert from 'node:assert/strict';
import { createHmac, createVerify, generateKeyPairSync } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { test } from 'node:test';

import {
  appJwt,
  authorizeTokenRequest,
  collectRepoState,
  SCOPE_PERMISSIONS,
  signBrokerRequest,
} from './broker.ts';
import worker, {
  correlateWatchedRepos,
  handle,
  matchesTarget,
  retain,
  sanitizeEvent,
} from './index.ts';

const MIGRATIONS = ['0001_init.sql', '0002_broker_grants.sql'].map(
  f => new URL(`../../migrations/audit/${f}`, import.meta.url)
);

/** Minimal D1 stand-in over node:sqlite (same SQL dialect). */
function d1() {
  const db = new DatabaseSync(':memory:');
  for (const m of MIGRATIONS) db.exec(readFileSync(m, 'utf8'));
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

test('hourly cron correlation: mints a watch token, reads state, attributes a disable', async () => {
  const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const e = env({
    GITHUB_APP_ID: '2934433',
    GITHUB_INSTALLATION_ID: '112037986',
    GITHUB_APP_PRIVATE_KEY: privateKey.export({ type: 'pkcs8', format: 'pem' }),
    WATCH_REPOS: 'JovieInc/Jovie',
  });
  let state = 'active';
  const calls = [];
  const fakeFetch = async (url, init = {}) => {
    calls.push(`${init.method ?? 'GET'} ${new URL(url).pathname}`);
    if (String(url).endsWith('/access_tokens')) {
      assert.deepEqual(JSON.parse(init.body).permissions, {
        actions: 'read',
        metadata: 'read',
      });
      return new Response(
        JSON.stringify({
          token: 'ghs_x',
          expires_at: '2026-10-29T02:00:00Z',
          permissions: {},
        })
      );
    }
    if (String(url).includes('/actions/workflows'))
      return new Response(
        JSON.stringify({
          workflows: [
            {
              id: 368087390,
              name: 'Lane Fix Relay',
              path: '.github/workflows/lane-fix-relay.yml',
              state,
              updated_at: '2026-10-29T00:23:50Z',
            },
          ],
        })
      );
    return new Response('[]');
  };
  await handle(
    signed('/v1/events', [ev()]),
    e,
    new Date('2026-10-29T00:24:00Z')
  );
  let out = await correlateWatchedRepos(
    e,
    new Date('2026-10-29T00:00:00Z'),
    fakeFetch
  );
  assert.deepEqual(out, [{ repo: 'JovieInc/Jovie', items: 1, changes: 0 }]);
  state = 'disabled_manually';
  out = await correlateWatchedRepos(
    e,
    new Date('2026-10-29T01:00:00Z'),
    fakeFetch
  );
  assert.equal(out[0].changes, 1);
  const row = e.AUDIT_DB.raw
    .prepare('SELECT status, matched_event_id FROM correlations')
    .get();
  assert.equal(row.status, 'attributed');
  assert.ok(calls.includes('POST /app/installations/112037986/access_tokens'));
});

test('no App key: the cron correlation is a no-op', async () => {
  assert.deepEqual(await correlateWatchedRepos(env(), new Date()), []);
});

// ---------------------------------------------------------------- review of #23742: broker security

const GRANT = {
  client_id: 'gem-lanes',
  agent_class: 'lane:gem',
  repos: 'Jovie',
  scopes: 'fleet,ci',
  active: 1,
};

function brokerEnv(extra = {}) {
  const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const e = env({
    GITHUB_APP_ID: '2934433',
    GITHUB_INSTALLATION_ID: '112037986',
    GITHUB_APP_PRIVATE_KEY: privateKey.export({ type: 'pkcs8', format: 'pem' }),
    BROKER_CLIENT_KEYS: JSON.stringify({
      'gem-lanes': 'k'.repeat(40),
      'no-grant': 'n'.repeat(40),
    }),
    ...extra,
  });
  e.AUDIT_DB.raw
    .prepare(
      `INSERT INTO broker_grants (client_id, agent_class, repos, scopes, active, created_at)
       VALUES (?, ?, ?, ?, ?, '2026-10-29T00:00:00Z')`
    )
    .run(
      GRANT.client_id,
      GRANT.agent_class,
      GRANT.repos,
      GRANT.scopes,
      GRANT.active
    );
  return e;
}

async function brokerRequest(
  body,
  { client = 'gem-lanes', key = 'k'.repeat(40), ts, nonce } = {}
) {
  const text = JSON.stringify(body);
  const t = String(ts ?? Math.floor(Date.parse('2026-10-29T12:00:00Z') / 1000));
  const n = nonce ?? `nonce-${Math.random().toString(36).slice(2)}-xxxxxxxx`;
  return new Request('https://jovie-fleet-audit.tim-fd8.workers.dev/v1/token', {
    method: 'POST',
    body: text,
    headers: {
      'x-fleet-broker-client': client,
      'x-fleet-broker-timestamp': t,
      'x-fleet-broker-nonce': n,
      'x-fleet-broker-signature': await signBrokerRequest(key, t, n, text),
    },
  });
}

const NOW = new Date('2026-10-29T12:00:00Z');

async function withMintStub(fn) {
  const realFetch = globalThis.fetch;
  const minted = [];
  globalThis.fetch = async (url, init) => {
    if (String(url).endsWith('/access_tokens')) {
      minted.push(JSON.parse(init.body));
      return new Response(
        JSON.stringify({
          token: 'ghs_test',
          expires_at: '2026-10-29T13:00:00Z',
          permissions: {},
        })
      );
    }
    return new Response('{}');
  };
  try {
    return await fn(minted);
  } finally {
    globalThis.fetch = realFetch;
  }
}

test('review 1: ci scope is actions:write only (cancel/rerun), nothing else writable', () => {
  assert.deepEqual(SCOPE_PERMISSIONS.ci, {
    actions: 'write',
    metadata: 'read',
  });
  for (const [scope, perms] of Object.entries(SCOPE_PERMISSIONS))
    assert.ok(
      !('administration' in perms) &&
        !('workflows' in perms) &&
        !('secrets' in perms),
      scope
    );
  assert.deepEqual(SCOPE_PERMISSIONS.watch, {
    actions: 'read',
    metadata: 'read',
  });
});

test('review 2a: the ingest signature cannot mint a token', async () => {
  await withMintStub(async minted => {
    const res = await handle(
      signed('/v1/token', { scope: 'fleet', reason: 'push the fix branch' }),
      brokerEnv(),
      NOW
    );
    assert.equal(res.status, 401);
    assert.equal(minted.length, 0);
  });
});

test('review 2b: a broker key equal to the ingest secret is refused', async () => {
  const e = brokerEnv({ INGEST_HMAC_SECRET: 'k'.repeat(40) });
  const res = await handle(
    await brokerRequest({ scope: 'fleet', reason: 'push the fix branch' }),
    e,
    NOW
  );
  assert.equal(res.status, 503);
});

test('review 2c: identity comes from the grant; body cannot pick agent, scope or repos beyond it', async () => {
  await withMintStub(async minted => {
    const e = brokerEnv();
    let res = await handle(
      await brokerRequest({
        agent: 'tim',
        scope: 'fleet',
        reason: 'push the fix branch',
      }),
      e,
      NOW
    );
    assert.equal(res.status, 403);
    res = await handle(
      await brokerRequest({
        scope: 'fleet',
        reason: 'push the fix branch',
        repositories: ['gbrain'],
      }),
      e,
      NOW
    );
    assert.equal(res.status, 403);
    res = await handle(
      await brokerRequest(
        { scope: 'fleet', reason: 'x' },
        { client: 'no-grant', key: 'n'.repeat(40) }
      ),
      e,
      NOW
    );
    assert.equal(res.status, 403);
    res = await handle(
      await brokerRequest({ scope: 'ci', reason: 'cancel stale relay runs' }),
      e,
      NOW
    );
    assert.equal(res.status, 403, 'ci without an issue');

    res = await handle(
      await brokerRequest({
        scope: 'ci',
        reason: 'cancel stale relay runs',
        issue: 'JOV-1',
        session: 's-9',
      }),
      e,
      NOW
    );
    assert.equal(res.status, 200);
    assert.deepEqual(minted.at(-1), {
      repositories: ['Jovie'],
      permissions: { actions: 'write', metadata: 'read' },
    });
    const row = e.AUDIT_DB.raw
      .prepare(
        "SELECT actor_agent, target, session_id, outcome FROM events WHERE action = 'token.issue'"
      )
      .get();
    assert.deepEqual(
      { ...row },
      {
        actor_agent: 'lane:gem',
        target: 'client:gem-lanes scope:ci',
        session_id: 's-9',
        outcome: 'ok',
      }
    );
  });
});

test('review 2d: replayed nonce and stale timestamp are rejected', async () => {
  await withMintStub(async minted => {
    const e = brokerEnv();
    const nonce = 'fixed-nonce-0123456789';
    const body = { scope: 'fleet', reason: 'push the fix branch' };
    assert.equal(
      (await handle(await brokerRequest(body, { nonce }), e, NOW)).status,
      200
    );
    assert.equal(
      (await handle(await brokerRequest(body, { nonce }), e, NOW)).status,
      409
    );
    const stale = Math.floor(NOW.getTime() / 1000) - 301;
    assert.equal(
      (await handle(await brokerRequest(body, { ts: stale }), e, NOW)).status,
      401
    );
    const tampered = await brokerRequest(body);
    const forged = new Request(tampered.url, {
      method: 'POST',
      headers: tampered.headers,
      body: JSON.stringify({
        scope: 'ci',
        reason: 'escalate quietly',
        issue: 'JOV-1',
      }),
    });
    assert.equal((await handle(forged, e, NOW)).status, 401);
    assert.equal(minted.length, 1);
  });
});

test('review 2e: grants can never hold watch or admin scopes', () => {
  const e = env();
  assert.throws(() =>
    e.AUDIT_DB.raw
      .prepare(
        "INSERT INTO broker_grants VALUES ('x', 'y', 'Jovie', 'fleet,watch', 1, null, 'now')"
      )
      .run()
  );
});

test('a valid broker request still needs the App key configured', async () => {
  const res = await handle(
    await brokerRequest({ scope: 'fleet', reason: 'push the fix branch' }),
    env(),
    NOW
  );
  assert.equal(res.status, 503);
});

test('app JWT is a verifiable RS256 token for jovie-bot', async () => {
  const { privateKey, publicKey } = generateKeyPairSync('rsa', {
    modulusLength: 2048,
  });
  const jwt = await appJwt(
    '2934433',
    privateKey.export({ type: 'pkcs8', format: 'pem' }),
    1_800_000_000
  );
  const [h, p, s] = jwt.split('.');
  const v = createVerify('RSA-SHA256');
  v.update(`${h}.${p}`);
  assert.ok(v.verify(publicKey, Buffer.from(s, 'base64url')));
  assert.equal(JSON.parse(Buffer.from(p, 'base64url')).iss, '2934433');
});

test('authorizeTokenRequest rejects the internal watch scope', () => {
  assert.equal(
    authorizeTokenRequest({ scope: 'watch', reason: 'yyyyyyyyy' }, GRANT),
    'scope must be fleet or ci'
  );
});

// ---------------------------------------------------------------- review 3: freshness

function cronEnv() {
  const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  return env({
    GITHUB_APP_ID: '2934433',
    GITHUB_INSTALLATION_ID: '112037986',
    GITHUB_APP_PRIVATE_KEY: privateKey.export({ type: 'pkcs8', format: 'pem' }),
    WATCH_REPOS: 'JovieInc/Jovie',
    MESH_TOKEN: 't',
    MESH_SENDER_ID: 's',
    MESH_SENDER_KIND: 'claude',
  });
}

function stateFetch(state) {
  return async (url, init = {}) => {
    const u = String(url);
    if (u.endsWith('/access_tokens'))
      return new Response(
        JSON.stringify({
          token: 'ghs_x',
          expires_at: '2026-10-29T02:00:00Z',
          permissions: {},
        })
      );
    if (state.fail) return new Response('{}', { status: 502 });
    if (u.includes('/actions/workflows'))
      return new Response(JSON.stringify({ workflows: state.workflows }));
    if (/\/rulesets\/\d+$/.test(u))
      return new Response(
        JSON.stringify({ updated_at: '2026-10-29T00:00:00Z' })
      );
    if (u.includes('/rulesets'))
      return new Response(JSON.stringify(state.rulesets ?? []));
    return new Response('{}');
  };
}

const wf = (id, name, st = 'active') => ({
  id,
  name,
  path: `.github/workflows/${name}.yml`,
  state: st,
  updated_at: '2026-10-29T00:23:50Z',
});

test('review 3: freshness advances only on success; a failed collection is stale and alerts once', async () => {
  const e = cronEnv();
  const alerts = [];
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (_u, init) => {
    alerts.push(JSON.parse(init.body).body);
    return new Response('{}');
  };
  try {
    const state = { workflows: [wf(1, 'ci')] };
    await correlateWatchedRepos(
      e,
      new Date('2026-10-29T01:00:00Z'),
      stateFetch(state)
    );
    let h = await (
      await handle(
        new Request('https://x/healthz'),
        e,
        new Date('2026-10-29T01:05:00Z')
      )
    ).json();
    assert.equal(h.last_collection_ok_at, '2026-10-29T01:00:00.000Z');
    assert.equal(h.collection_stale, false);

    state.fail = true;
    await correlateWatchedRepos(
      e,
      new Date('2026-10-29T02:00:00Z'),
      stateFetch(state)
    );
    await correlateWatchedRepos(
      e,
      new Date('2026-10-29T03:00:00Z'),
      stateFetch(state)
    );
    h = await (
      await handle(
        new Request('https://x/healthz'),
        e,
        new Date('2026-10-29T03:05:00Z')
      )
    ).json();
    assert.equal(
      h.last_collection_ok_at,
      '2026-10-29T01:00:00.000Z',
      'did not advance on failure'
    );
    assert.equal(h.collection_stale, true);
    assert.equal(h.collection_errors.length, 1);
    assert.equal(
      alerts.filter(a => a.includes('correlation FAILED')).length,
      1,
      'alerts once per outage'
    );

    state.fail = false;
    await correlateWatchedRepos(
      e,
      new Date('2026-10-29T04:00:00Z'),
      stateFetch(state)
    );
    h = await (
      await handle(
        new Request('https://x/healthz'),
        e,
        new Date('2026-10-29T04:05:00Z')
      )
    ).json();
    assert.equal(h.collection_stale, false);
    assert.deepEqual(h.collection_errors, []);
  } finally {
    globalThis.fetch = realFetch;
  }
});

test('review 3b: an unreadable ruleset list fails the whole collection (no silent partial snapshot)', async () => {
  await assert.rejects(
    collectRepoState('JovieInc/Jovie', 't', async url =>
      String(url).includes('rulesets')
        ? new Response('{}', { status: 403 })
        : new Response(JSON.stringify({ workflows: [] }))
    )
  );
});

test('review 3c: never configured means no freshness at all', async () => {
  const h = await (
    await handle(new Request('https://x/healthz'), env(), new Date())
  ).json();
  assert.equal(h.last_collection_ok_at, null);
  assert.equal(h.collection_stale, true);
});

// ---------------------------------------------------------------- review 4: full-set drift

test('review 4a: additions and removals are detected; ruleset removal without a shim event alerts', async () => {
  const e = env();
  const repo = 'JovieInc/Jovie';
  const t0 = new Date('2026-10-29T00:00:00Z');
  const rs = {
    kind: 'ruleset',
    id: 24952446,
    name: 'main protection',
    updated_at: '2026-10-01T00:00:00Z',
  };
  const w = (id, name) => ({
    kind: 'workflow',
    id,
    name,
    path: `.github/workflows/${name}.yml`,
    state: 'active',
  });
  await handle(
    signed('/v1/snapshot', { repo, items: [w(1, 'ci'), rs] }),
    e,
    t0
  );
  const res = await handle(
    signed('/v1/snapshot', { repo, items: [w(1, 'ci'), w(2, 'new-flow')] }),
    e,
    new Date('2026-10-29T01:00:00Z')
  );
  const { changes } = await res.json();
  const byTarget = Object.fromEntries(changes.map(c => [c.target, c]));
  assert.match(byTarget['new-flow'].change, /added/);
  assert.equal(
    byTarget['new-flow'].status,
    'observed',
    'workflow files arrive by merged commits'
  );
  const removed = changes.find(c => /removed/.test(c.change));
  assert.ok(removed, 'ruleset removal detected');
  assert.equal(removed.status, 'unattributed');
  const keys = e.AUDIT_DB.raw
    .prepare('SELECT key FROM snapshots')
    .all()
    .map(r => r.key);
  assert.ok(
    !keys.some(k => k.includes('ruleset')),
    'removed objects leave the snapshot'
  );
});

test('review 4b: a failed or refused mutation never counts as attribution', async () => {
  const e = env();
  const repo = 'JovieInc/Jovie';
  const t0 = new Date('2026-10-29T00:00:00Z');
  await handle(signed('/v1/events', [ev({ outcome: 'exit:1' })]), e, t0);
  const item = st => ({
    kind: 'workflow',
    id: 368087390,
    name: 'Lane Fix Relay',
    state: st,
    updated_at: '2026-10-29T00:23:50Z',
  });
  await handle(
    signed('/v1/snapshot', { repo, items: [item('active')] }),
    e,
    t0
  );
  const res = await handle(
    signed('/v1/snapshot', { repo, items: [item('disabled_manually')] }),
    e,
    new Date('2026-10-29T01:00:00Z')
  );
  const [change] = (await res.json()).changes;
  assert.equal(change.status, 'unattributed');
  assert.equal(change.matched_event_id, null);
});

test('review 4c: oversized snapshots are rejected instead of truncated into false removals', async () => {
  const items = Array.from({ length: 501 }, (_, i) => ({
    kind: 'workflow',
    id: i,
    name: `w${i}`,
    state: 'active',
  }));
  const res = await handle(
    signed('/v1/snapshot', { repo: 'JovieInc/Jovie', items }),
    env()
  );
  assert.equal(res.status, 400);
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
