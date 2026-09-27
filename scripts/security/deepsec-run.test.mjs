import assert from 'node:assert/strict';
import test from 'node:test';
import {
  loadPolicy,
  modelFor,
  plan,
  readLedger,
  scannerEnv,
  updateLedger,
} from './deepsec-run.mjs';

const LEADERBOARD = {
  results: [
    {
      modelId: 'openai/gpt-6-sol',
      model: 'gpt-6-sol',
      harness: 'codex',
      reasoning: 'xhigh',
      score: 40,
    },
    {
      modelId: 'openai/gpt-6-astra',
      model: 'gpt-6-astra',
      harness: 'codex',
      reasoning: 'xhigh',
      score: 37,
    },
    {
      modelId: 'openai/gpt-5.6-sol',
      model: 'gpt-5.6-sol',
      harness: 'codex',
      reasoning: 'xhigh',
      score: 35,
    },
    {
      modelId: 'anthropic/claude-opus-5',
      model: 'claude-opus-5',
      harness: 'claude',
      reasoning: 'max',
      score: 32,
    },
  ],
};

function json(status, body) {
  return new Response(body === undefined ? null : JSON.stringify(body), {
    status,
  });
}

function ledgerFile(ledger, sha = 'blob1') {
  return json(200, {
    sha,
    content: Buffer.from(JSON.stringify(ledger)).toString('base64'),
  });
}

// Routes GitHub contents reads to `ledger` and the leaderboard URL to LEADERBOARD.
function fakeFetch(ledger) {
  return async url =>
    String(url).includes('deepsecbench')
      ? json(200, LEADERBOARD)
      : ledger
        ? ledgerFile(ledger)
        : json(404, {});
}

const emptyLedger = {
  schemaVersion: 1,
  models: {},
  spend: {},
  runs: [],
  coverage: {},
};
const NOW = '2026-09-27T12:00:00Z';

test('reads a missing ledger as empty and an existing one from the branch', async () => {
  assert.deepEqual(
    (await readLedger({ token: 't', fetchImpl: fakeFetch(null) })).ledger,
    emptyLedger
  );
  const stored = { ...emptyLedger, spend: { '2026-09': 3 } };
  const read = await readLedger({ token: 't', fetchImpl: fakeFetch(stored) });
  assert.equal(read.sha, 'blob1');
  assert.equal(read.ledger.spend['2026-09'], 3);
  await assert.rejects(
    readLedger({ token: 't', fetchImpl: async () => json(500, {}) }),
    /HTTP 500/
  );
});

test('ledger writes re-apply the change after a concurrent writer wins', async () => {
  const calls = [];
  let stored = { ...emptyLedger, spend: { '2026-09': 1 } };
  let version = 1;
  const fetchImpl = async (url, init = {}) => {
    calls.push(init.method ?? 'GET');
    if ((init.method ?? 'GET') === 'GET')
      return ledgerFile(stored, `blob${version}`);
    const body = JSON.parse(init.body);
    if (calls.filter(method => method === 'PUT').length === 1) {
      // Someone else recorded $2 between our read and write.
      stored = { ...stored, spend: { '2026-09': 3 } };
      version += 1;
      return json(409, {});
    }
    assert.equal(body.sha, `blob${version}`);
    assert.equal(body.branch, 'security/deepsec-ledger');
    stored = JSON.parse(Buffer.from(body.content, 'base64').toString('utf8'));
    return json(200, {});
  };
  const next = await updateLedger(
    ledger => ({
      ...ledger,
      spend: { '2026-09': ledger.spend['2026-09'] + 0.5 },
    }),
    { token: 't', fetchImpl }
  );
  assert.equal(next.spend['2026-09'], 3.5);
  assert.equal(stored.spend['2026-09'], 3.5);
  assert.deepEqual(calls, ['GET', 'PUT', 'GET', 'PUT']);
});

test('ledger writes create the orphan branch on first use and give up on hard errors', async () => {
  const paths = [];
  let created = false;
  const fetchImpl = async (url, init = {}) => {
    const path = String(url).replace(/^.*\/repos\/[^/]+\/[^/]+\//, '');
    paths.push(`${init.method ?? 'GET'} ${path.split('?')[0]}`);
    if (path.startsWith('git/')) {
      if (path === 'git/refs') created = true;
      return json(201, { sha: 'x' });
    }
    if ((init.method ?? 'GET') === 'GET') return json(404, {});
    return created ? json(201, {}) : json(404, {});
  };
  await updateLedger(ledger => ledger, { token: 't', fetchImpl });
  assert.deepEqual(paths, [
    'GET contents/ledger.json',
    'PUT contents/ledger.json',
    'POST git/trees',
    'POST git/commits',
    'POST git/refs',
    'GET contents/ledger.json',
    'PUT contents/ledger.json',
  ]);
  await assert.rejects(
    updateLedger(ledger => ledger, {
      token: 't',
      fetchImpl: async (url, init = {}) =>
        (init.method ?? 'GET') === 'GET' ? json(404, {}) : json(403, {}),
    }),
    /ledger write HTTP 403/
  );
  await assert.rejects(
    updateLedger(ledger => ledger, {
      token: 't',
      attempts: 2,
      fetchImpl: async (url, init = {}) =>
        (init.method ?? 'GET') === 'GET' ? json(404, {}) : json(409, {}),
    }),
    /kept conflicting/
  );
});

const base = { GITHUB_TOKEN: 't', HEAD_SHA: 'abc', WEEKLY_CRON: '17 7 * * 1' };

test('PR plans scan only sensitive changed files with the cheap model under the PR cap', async () => {
  const planned = await plan(
    {
      ...base,
      EVENT: 'pull_request',
      CHANGED_FILES: 'apps/web/lib/auth/cached.ts\napps/web/components/A.tsx\n',
    },
    { fetchImpl: fakeFetch(null), now: NOW }
  );
  assert.equal(planned.run, true);
  assert.equal(planned.kind, 'pr');
  assert.deepEqual(planned.files, ['apps/web/lib/auth/cached.ts']);
  assert.equal(planned.model.gatewayId, 'openai/gpt-6-luna');
  assert.equal(planned.capUsd, 2);
  const none = await plan(
    { ...base, EVENT: 'pull_request', CHANGED_FILES: 'README.md' },
    { fetchImpl: fakeFetch(null), now: NOW }
  );
  assert.equal(none.run, false);
  assert.match(none.reason, /no auth\/billing\/security-sensitive files/);
});

test('plans skip, fail closed, when the month budget is spent', async () => {
  const spent = { ...emptyLedger, spend: { '2026-09': 199.9 } };
  const planned = await plan(
    {
      ...base,
      EVENT: 'pull_request',
      CHANGED_FILES: 'apps/web/lib/auth/cached.ts',
    },
    { fetchImpl: fakeFetch(spent), now: NOW }
  );
  assert.equal(planned.run, false);
  assert.match(planned.reason, /monthly budget exhausted/);
  const lowered = await plan(
    {
      ...base,
      EVENT: 'schedule',
      SCHEDULE: '17 7 * * 1',
      DEEPSEC_MONTHLY_CAP_USD: '0',
    },
    { fetchImpl: fakeFetch(null), now: NOW }
  );
  assert.equal(lowered.kind, 'weekly');
  assert.equal(lowered.run, false);
});

test('the first frontier run scans the strongest model and seeds the rest as known', async () => {
  const planned = await plan(
    { ...base, EVENT: 'schedule', SCHEDULE: '41 6 * * *' },
    { fetchImpl: fakeFetch(null), now: NOW }
  );
  assert.equal(planned.kind, 'frontier');
  assert.equal(planned.run, true);
  assert.equal(planned.model.gatewayId, 'openai/gpt-6-sol');
  assert.equal(planned.capUsd, 75);
  assert.deepEqual(
    planned.seed.map(model => model.gatewayId),
    ['openai/gpt-6-astra', 'openai/gpt-5.6-sol']
  );
});

test('frontier plans never rescan a recorded model unless forced', async () => {
  const known = {
    ...emptyLedger,
    models: Object.fromEntries(
      ['openai/gpt-6-sol', 'openai/gpt-6-astra', 'openai/gpt-5.6-sol'].map(
        id => [id, { status: 'complete' }]
      )
    ),
  };
  const idle = await plan(
    { ...base, EVENT: 'schedule', SCHEDULE: '41 6 * * *' },
    { fetchImpl: fakeFetch(known), now: NOW }
  );
  assert.equal(idle.run, false);
  assert.match(idle.reason, /no new frontier model/);
  const manual = {
    ...base,
    EVENT: 'workflow_dispatch',
    INPUT_MODE: 'frontier',
    INPUT_MODEL: 'openai/gpt-6-sol',
  };
  const repeat = await plan(manual, { fetchImpl: fakeFetch(known), now: NOW });
  assert.equal(repeat.run, false);
  assert.match(repeat.reason, /already scanned the repo once/);
  const forced = await plan(
    { ...manual, INPUT_FORCE: 'true' },
    { fetchImpl: fakeFetch(known), now: NOW }
  );
  assert.equal(forced.run, true);
  const unknown = await plan(
    { ...manual, INPUT_MODEL: 'acme/nope' },
    { fetchImpl: fakeFetch(known), now: NOW }
  );
  assert.equal(unknown.run, false);
  assert.match(unknown.reason, /not on DeepSecBench/);
  const claude = await plan(
    { ...manual, INPUT_MODEL: 'anthropic/claude-opus-5' },
    { fetchImpl: fakeFetch(known), now: NOW }
  );
  assert.deepEqual(claude.model, {
    gatewayId: 'anthropic/claude-opus-5',
    agent: 'claude',
    model: 'claude-opus-5',
    reasoning: 'xhigh',
  });
});

test('weekly plans carry coverage and resolve verification models', async () => {
  const planned = await plan(
    { ...base, EVENT: 'workflow_dispatch', INPUT_MODE: 'weekly' },
    {
      fetchImpl: fakeFetch({ ...emptyLedger, coverage: { 'a.ts': 'h' } }),
      now: NOW,
    }
  );
  assert.equal(planned.run, true);
  assert.equal(planned.capUsd, 15);
  assert.deepEqual(planned.coverage, { 'a.ts': 'h' });
  assert.deepEqual(planned.verify, []);
  const policy = loadPolicy();
  assert.equal(
    modelFor('openai/gpt-6-luna', policy, LEADERBOARD),
    policy.models.cheap
  );
  assert.equal(
    modelFor('openai/gpt-6-astra', policy, LEADERBOARD).model,
    'gpt-6-astra'
  );
  assert.equal(modelFor('acme/nope', policy, LEADERBOARD), null);
});

test('the scanner process gets a minimal env with only the gateway credential', () => {
  const policy = loadPolicy();
  const env = scannerEnv(
    {
      PATH: '/bin',
      HOME: '/home/runner',
      RUNNER_TEMP: '/tmp/r',
      AI_GATEWAY_API_KEY: 'vck_x',
      OPENAI_API_KEY: 'sk-leak',
      LINEAR_API_KEY: 'lin',
      GITHUB_TOKEN: 'ghs',
      NODE_OPTIONS: '--require evil',
    },
    policy,
    '/tmp/data',
    '/src'
  );
  assert.deepEqual(Object.keys(env).sort(), [
    'AI_GATEWAY_API_KEY',
    'ANTHROPIC_CUSTOM_HEADERS',
    'CI',
    'DEEPSEC_DATA_ROOT',
    'DEEPSEC_SOURCE_ROOT',
    'HOME',
    'LANG',
    'PATH',
    'TMPDIR',
  ]);
  assert.equal(
    env.ANTHROPIC_CUSTOM_HEADERS,
    'ai-reporting-tags: security-scan,deepsec'
  );
  assert.equal(env.TMPDIR, '/tmp/r');
});
