import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, renameSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { ApiError, createApiClient } from '../../packages/api-client/client.ts';
import { FakeClock } from '../../packages/api-client/fake-provider.ts';
import {
  hashCredential,
  MemoryLedgerStore,
} from '../../packages/api-client/store.ts';
import {
  aggregate,
  buildQuestions,
  CONNECT_ATTEMPT_TIMEOUT_MS,
  callClef,
  ensureConnectAttemptBudget,
  evaluateScreenshots,
  MAX_REVISIONS,
  planRequests,
  resolveWorkersAiAuth,
  revisionNotes,
  rulesFor,
  runRevisionLoop,
  SCREENSHOT_RULES,
  spentTodayUsd,
} from './clef-screenshot-evaluator.mjs';

const PNG = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  Buffer.alloc(16),
]);
const tmp = () => mkdtempSync(join(tmpdir(), 'clef-eval-'));
const auth = { accountId: 'acct', token: 'tok', source: 'test' };
const clientFactory =
  (store = new MemoryLedgerStore(), clock = new FakeClock()) =>
  options =>
    createApiClient({
      ...options,
      store,
      now: clock.read,
      sleep: clock.sleep,
      random: () => 0.5,
      log: () => {},
    });
const env = dir => ({ CLEF_EVAL_LEDGER: join(dir, 'ledger.jsonl') });
const answers = (overrides = {}) =>
  Object.fromEntries(
    rulesFor('marketing').map(id => [
      id,
      { type: 'noul', noul: overrides[id] ?? 0.01 },
    ])
  );
const stubCall =
  seq =>
  async ({ images }) => {
    assert.ok(images.length >= 1 && images.length <= 4);
    return { answers: seq.shift() ?? answers(), usage: { input_tokens: 1000 } };
  };

test('profiles select rules; app drops marketing-only rules', () => {
  assert.ok(rulesFor('marketing').includes('dark_first'));
  assert.ok(!rulesFor('app').includes('dark_first'));
  assert.ok(!rulesFor('app').includes('title_case_display'));
  assert.throws(() => rulesFor('nope'), /unknown profile/);
  const q = buildQuestions(['serif_type']);
  assert.deepEqual(q.serif_type.type, 'noul');
});

test('requests carry the overview first and at most 4 images', () => {
  const reqs = planRequests([
    { label: 'a', overview: 'O', tiles: ['1', '2', '3', '4', '5'] },
    { label: 'b', overview: 'P' },
  ]);
  assert.deepEqual(
    reqs.map(r => r.images),
    [['O', '1', '2', '3'], ['O', '4', '5'], ['P']]
  );
});

test('aggregate takes the worst view; ungated rules are advisories', () => {
  const v = aggregate(
    ['serif_type', 'layout_defect', 'clutter'],
    [
      {
        label: 'desktop',
        answers: {
          serif_type: { noul: 0.1 },
          layout_defect: { noul: 0.9 },
          clutter: { noul: 0.1 },
        },
      },
      {
        label: 'mobile',
        answers: {
          serif_type: { noul: 0.6 },
          layout_defect: { noul: 0.1 },
          clutter: { noul: 0.1 },
        },
      },
    ]
  );
  assert.equal(v.rules.serif_type.worstView, 'mobile');
  assert.deepEqual(v.failed, ['serif_type']);
  assert.deepEqual(v.advisories, ['layout_defect']);
  assert.equal(v.pass, false);
  const missing = aggregate(['serif_type'], [{ label: 'x', answers: {} }]);
  assert.equal(missing.complete, false);
  assert.equal(missing.pass, false);
});

test('evaluate returns per-rule probabilities, pass/fail and cost', async () => {
  const dir = tmp();
  /** @type {any} */
  const r = await evaluateScreenshots([{ label: 'home', overview: PNG }], {
    auth,
    env: env(dir),
    call: stubCall([answers({ serif_type: 0.9 })]),
  });
  assert.equal(r.status, 'evaluated');
  assert.equal(r.pass, false);
  assert.deepEqual(r.failed, ['serif_type']);
  assert.equal(
    r.rules.serif_type.threshold,
    SCREENSHOT_RULES.serif_type.threshold
  );
  assert.equal(r.inputTokens, 1000);
  assert.ok(r.estimatedUsd > 0 && r.certified === false);
  assert.ok(spentTodayUsd(join(dir, 'ledger.jsonl')) > 0);
  assert.match(revisionNotes(r)[0], /^FAIL serif_type \(p=0\.90/);
});

test('daily cap, provider errors and transient retry', async () => {
  const dir = tmp();
  writeFileSync(
    join(dir, 'ledger.jsonl'),
    `${JSON.stringify({ day: new Date().toISOString().slice(0, 10), usd: 9 })}\nnot-json\n`
  );
  const capped = await evaluateScreenshots([{ label: 'x', overview: PNG }], {
    auth,
    env: env(dir),
    call: stubCall([]),
  });
  assert.equal(capped.status, 'over-budget');

  const d2 = tmp();
  const failing = await evaluateScreenshots([{ label: 'x', overview: PNG }], {
    auth,
    env: env(d2),
    call: async () => {
      throw new Error('workers-ai-error-3030');
    },
  });
  assert.equal(failing.status, 'provider-error');

  let calls = 0;
  const retried = await evaluateScreenshots([{ label: 'x', overview: PNG }], {
    auth,
    env: env(d2),
    call: async () => {
      calls += 1;
      if (calls === 1) throw new Error('workers-ai-error-429');
      return { answers: answers(), usage: { input_tokens: 10 } };
    },
  });
  assert.equal(retried.status, 'evaluated');
  assert.equal(retried.pass, true);
  assert.equal(calls, 2);
});

test('revision loop stops after two revisions and ships with notes', async () => {
  const dir = tmp();
  const revised = [];
  const out = await runRevisionLoop({
    capture: async () => [{ label: 'home', overview: PNG }],
    revise: async ({ notes, attempt }) => revised.push({ attempt, notes }),
    maxRevisions: 99,
    auth,
    env: env(dir),
    call: stubCall([
      answers({ clutter: 0.9 }),
      answers({ clutter: 0.9 }),
      answers({ clutter: 0.9 }),
    ]),
  });
  assert.equal(MAX_REVISIONS, 2);
  assert.equal(out.revisions, 2);
  assert.equal(revised.length, 2);
  assert.equal(out.shipWithNotes, true);
  assert.match(out.notes[0], /clutter/);

  const fixed = await runRevisionLoop({
    capture: async () => [{ label: 'home', overview: PNG }],
    revise: async () => {},
    auth,
    env: env(tmp()),
    call: stubCall([answers({ clutter: 0.9 }), answers()]),
  });
  assert.equal(fixed.revisions, 1);
  assert.equal(fixed.final.pass, true);
  assert.equal(fixed.shipWithNotes, false);
});

test('auth prefers the env token, then a fresh wrangler OAuth token', () => {
  assert.equal(
    resolveWorkersAiAuth({
      env: { CLOUDFLARE_WORKERS_AI_TOKEN: 't', CLOUDFLARE_ACCOUNT_ID: 'a' },
    }).source,
    'env'
  );
  const home = tmp();
  writeFileSync(
    join(home, 'default.toml'),
    `oauth_token = "oauth"\nexpiration_time = "${new Date(Date.now() + 3600_000).toISOString()}"\n`
  );
  mkdirSync(join(home, 'config'));
  renameSync(join(home, 'default.toml'), join(home, 'config/default.toml'));
  const found = resolveWorkersAiAuth({
    env: { WRANGLER_HOME: home },
    refresh: false,
  });
  assert.deepEqual([found.token, found.source], ['oauth', 'wrangler-oauth']);
  assert.throws(
    () =>
      resolveWorkersAiAuth({ env: { WRANGLER_HOME: tmp() }, refresh: false }),
    /no Workers AI credential/
  );
});

test('callClef posts data URIs and maps errors without leaking bodies', async () => {
  /** @type {any} */
  let seen;
  const ok = await callClef({
    createClient: clientFactory(),
    auth,
    model: 'clef-flash',
    state: 's',
    questions: {},
    images: [PNG],
    fetchImpl: async (url, init) => {
      seen = {
        url: String(url),
        body: JSON.parse(init.body),
        auth: new Headers(init.headers).get('Authorization'),
      };
      return Response.json({
        success: true,
        result: { answers: {}, usage: {} },
      });
    },
  });
  assert.deepEqual(ok, { answers: {}, usage: {} });
  assert.match(
    seen.url,
    /accounts\/acct\/ai\/run\/@cf\/cloudflare\/clef-flash$/
  );
  assert.match(seen.body.images[0], /^data:image\/png;base64,/);
  assert.equal(seen.auth, 'Bearer tok');
  await assert.rejects(
    callClef({
      createClient: clientFactory(),
      auth,
      model: 'clef',
      state: 's',
      questions: {},
      images: [PNG],
      fetchImpl: async () =>
        Response.json(
          { success: false, errors: [{ code: 3030 }] },
          { status: 422 }
        ),
    }),
    /workers-ai-error-3030/
  );
  await assert.rejects(
    callClef({ auth, model: 'x', state: '', questions: {}, images: [] }),
    /unknown model/
  );
  await assert.rejects(
    callClef({
      auth,
      model: 'clef',
      state: '',
      questions: {},
      images: [Buffer.from('GIF89a')],
      fetchImpl: async () => ({}),
    }),
    /PNG or JPEG/
  );
});

test('wrangler token is refreshed before expiry and after an auth or fetch failure', async () => {
  const oauth = (token, expires) => ({
    accountId: 'acct',
    token,
    source: 'wrangler-oauth',
    expires,
  });
  const now = () => 1_000_000;

  // Near-expiry token: refreshed before the first call.
  let refreshes = 0;
  const seenTokens = [];
  const pre = await evaluateScreenshots([{ label: 'x', overview: PNG }], {
    auth: oauth('old', now() + 60_000),
    env: env(tmp()),
    now,
    refreshAuth: () => {
      refreshes += 1;
      return oauth('fresh', now() + 3_600_000);
    },
    call: async ({ auth: a }) => {
      seenTokens.push(a.token);
      return { answers: answers(), usage: { input_tokens: 1 } };
    },
  });
  assert.equal(pre.status, 'evaluated');
  assert.deepEqual([refreshes, seenTokens], [1, ['fresh']]);

  // A token that still looks valid but is rejected ("fetch failed" or 10000): refresh once and retry.
  for (const failure of ['fetch failed', 'workers-ai-error-10000']) {
    const tokens = [];
    const r = await evaluateScreenshots([{ label: 'x', overview: PNG }], {
      auth: oauth('stale', now() + 3_600_000),
      env: env(tmp()),
      now,
      refreshAuth: () => oauth('fresh', now() + 3_600_000),
      call: async ({ auth: a }) => {
        tokens.push(a.token);
        if (a.token === 'stale') throw new TypeError(failure);
        return { answers: answers(), usage: { input_tokens: 1 } };
      },
    });
    assert.equal(r.status, 'evaluated', failure);
    assert.deepEqual(tokens, ['stale', 'fresh']);
  }

  // A refresh that cannot fix it still fails open, after exactly one retry.
  let attempts = 0;
  const failed = await evaluateScreenshots([{ label: 'x', overview: PNG }], {
    auth: oauth('stale', now() + 3_600_000),
    env: env(tmp()),
    now,
    refreshAuth: () => oauth('still-bad', now() + 3_600_000),
    call: async () => {
      attempts += 1;
      throw new TypeError('fetch failed');
    },
  });
  assert.equal(failed.status, 'provider-error');
  assert.equal(failed.pass, null);
  assert.equal(attempts, 2);

  // Env tokens are never refreshed; an auth error fails open without a retry.
  let envCalls = 0;
  const envAuth = await evaluateScreenshots([{ label: 'x', overview: PNG }], {
    auth,
    env: env(tmp()),
    refreshAuth: () => assert.fail('env token must not be refreshed'),
    call: async () => {
      envCalls += 1;
      throw new Error('workers-ai-error-10000');
    },
  });
  assert.equal(envAuth.status, 'provider-error');
  assert.equal(envCalls, 1);
});

test('resolveWorkersAiAuth runs the wrangler refresh for an expired token', () => {
  const home = tmp();
  mkdirSync(join(home, 'config'));
  const file = join(home, 'config/default.toml');
  writeFileSync(
    file,
    'oauth_token = "expired"\nexpiration_time = "2000-01-01T00:00:00.000Z"\n'
  );
  let ran = 0;
  const out = resolveWorkersAiAuth({
    env: { WRANGLER_HOME: home },
    runRefresh: () => {
      ran += 1;
      writeFileSync(
        file,
        `oauth_token = "renewed"\nexpiration_time = "${new Date(Date.now() + 3_600_000).toISOString()}"\n`
      );
    },
  });
  assert.equal(ran, 1);
  assert.equal(out.token, 'renewed');
  assert.ok(out.expires > Date.now());
  // A failing refresh falls through to the readable token instead of throwing.
  const kept = resolveWorkersAiAuth({
    env: { WRANGLER_HOME: home },
    force: true,
    runRefresh: () => {
      throw new Error('wrangler missing');
    },
  });
  assert.equal(kept.token, 'renewed');
});

test('calls raise the connect attempt budget that caused "fetch failed" timeouts', async () => {
  const net = await import('node:net');
  net.setDefaultAutoSelectFamilyAttemptTimeout(250);
  await callClef({
    createClient: clientFactory(),
    auth,
    model: 'clef',
    state: 's',
    questions: {},
    images: [PNG],
    fetchImpl: async () => Response.json({ success: true, result: {} }),
  });
  assert.equal(
    net.getDefaultAutoSelectFamilyAttemptTimeout(),
    CONNECT_ATTEMPT_TIMEOUT_MS
  );
  net.setDefaultAutoSelectFamilyAttemptTimeout(10_000);
  ensureConnectAttemptBudget();
  assert.equal(net.getDefaultAutoSelectFamilyAttemptTimeout(), 10_000);
});

test('Cloudflare cooldown is shared across Clef calls without exposing the credential', async () => {
  const store = new MemoryLedgerStore();
  const clock = new FakeClock();
  const createClient = clientFactory(store, clock);
  let calls = 0;
  const options = {
    auth,
    model: 'clef',
    state: 's',
    questions: {},
    images: [PNG],
    createClient,
    fetchImpl: async () => {
      calls += 1;
      if (calls === 1)
        return Response.json(
          { success: false },
          { status: 429, headers: { 'retry-after': '60' } }
        );
      return Response.json({ success: true, result: { answers: {} } });
    },
  };
  const deferred = error =>
    error instanceof ApiError && error.retryAt > clock.now;
  await assert.rejects(callClef(options), deferred);
  await assert.rejects(callClef(options), deferred);
  assert.equal(calls, 1);
  const ledger = await store.read('cloudflare');
  assert.deepEqual(Object.keys(ledger.credentials), [
    hashCredential('cloudflare', auth.token),
  ]);
  clock.now += 60_001;
  assert.deepEqual(await callClef(options), { answers: {} });
  assert.equal(calls, 2);
});

test('Clef transport delegates one transient retry to the shared client', async () => {
  const clock = new FakeClock();
  const started = clock.now;
  let calls = 0;
  const result = await callClef({
    auth,
    model: 'clef',
    state: 's',
    questions: {},
    images: [PNG],
    createClient: clientFactory(new MemoryLedgerStore(), clock),
    fetchImpl: async () => {
      calls += 1;
      return calls === 1
        ? Response.json({ success: false }, { status: 503 })
        : Response.json({ success: true, result: { answers: {} } });
    },
  });
  assert.deepEqual(result, { answers: {} });
  assert.equal(calls, 2);
  assert.ok(clock.now > started, 'client applies its backoff before retrying');
  let failures = 0;
  await assert.rejects(
    callClef({
      auth,
      model: 'clef',
      state: 's',
      questions: {},
      images: [PNG],
      createClient: clientFactory(),
      fetchImpl: async () => {
        failures += 1;
        return Response.json({ success: false }, { status: 503 });
      },
    }),
    error => error instanceof ApiError && error.kind === 'exhausted'
  );
  assert.equal(failures, 2, 'persistent errors stop after one transport retry');
});
