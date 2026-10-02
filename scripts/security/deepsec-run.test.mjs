import assert from 'node:assert/strict';
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import {
  loadPolicy,
  modelFor,
  plan,
  readLedger,
  scan,
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

// A stand-in for the deepsec CLI: writes run metadata and FileRecords the way
// deepsec does, driven by fake.json in the data root (the scanner env is
// minimal, so behavior cannot come from environment variables).
const FAKE_DEEPSEC = `#!/usr/bin/env node
const fs = require('node:fs');
const path = require('node:path');
const root = path.join(process.env.DEEPSEC_DATA_ROOT, 'jovie');
const fake = JSON.parse(fs.readFileSync(path.join(process.env.DEEPSEC_DATA_ROOT, 'fake.json'), 'utf8'));
const args = process.argv.slice(2);
if (fake.noRun) process.exit(0);
const runId = 'run-' + Date.now() + '-' + Math.random().toString(16).slice(2);
fs.mkdirSync(path.join(root, 'runs'), { recursive: true });
fs.writeFileSync(path.join(root, 'runs', runId + '.json'), JSON.stringify({ runId }));
const files = args[args.indexOf('--files') + 1].split(',');
const model = args[args.indexOf('--model') + 1];
for (const file of files) {
  if ((fake.skip ?? []).includes(file)) continue;
  const out = path.join(root, 'files', file + '.json');
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, JSON.stringify({
    filePath: file,
    fileHash: 'hash-' + file,
    status: 'analyzed',
    candidates: [],
    analysisHistory: [{ runId, model, usage: { inputTokens: 1000000, outputTokens: 0 } }],
    findings: file === fake.vulnerable
      ? [{ severity: 'HIGH', vulnSlug: 'auth-bypass', title: 'Bypass', description: 'd', recommendation: 'r', confidence: 'high', lineNumbers: [3], producedByRunId: runId }]
      : [],
  }));
}
process.exit(fake.exit ?? 0);
`;

async function scanWith(fake, planOverrides = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'deepsec-scan-'));
  const bin = join(dir, 'deepsec');
  writeFileSync(bin, FAKE_DEEPSEC);
  chmodSync(bin, 0o755);
  mkdirSync(join(dir, 'deepsec-data'));
  writeFileSync(join(dir, 'deepsec-data', 'fake.json'), JSON.stringify(fake));
  const plan = {
    kind: 'pr',
    headSha: 'abc123',
    capUsd: 2,
    monthSpentUsd: 0,
    model: {
      gatewayId: 'openai/gpt-6-luna',
      agent: 'codex',
      model: 'gpt-6-luna',
      reasoning: 'xhigh',
    },
    files: ['a.ts', 'b.ts', 'c.ts'],
    ...planOverrides,
  };
  writeFileSync(join(dir, 'plan.json'), JSON.stringify(plan));
  const pricing = {
    data: [
      {
        id: 'openai/gpt-6-luna',
        pricing: { input: '0.0000001', output: '0.0000005' },
      },
    ],
  };
  const result = await scan(
    {
      PATH: process.env.PATH,
      RUNNER_TEMP: dir,
      SRC_ROOT: dir,
      PLAN_FILE: join(dir, 'plan.json'),
      RESULT_FILE: join(dir, 'result.json'),
      GITHUB_STEP_SUMMARY: join(dir, 'summary.md'),
    },
    { bin, fetchImpl: async () => json(200, pricing), now: new Date(NOW) }
  );
  return { result, summary: readFileSync(join(dir, 'summary.md'), 'utf8') };
}

test('a complete PR scan reports cost, analyzed files and grouped findings', async () => {
  const { result, summary } = await scanWith({ vulnerable: 'b.ts', exit: 1 });
  assert.equal(result.status, 'complete');
  assert.equal(result.error, null);
  assert.deepEqual(result.analyzed.map(row => row.path).sort(), [
    'a.ts',
    'b.ts',
    'c.ts',
  ]);
  assert.equal(result.usage.inputTokens, 3_000_000);
  // 3M input tokens at $0.10/M times the 1.75 safety factor.
  assert.equal(result.usage.costUsd, 0.525);
  assert.equal(result.groups.length, 1);
  assert.equal(result.groups[0].path, 'b.ts');
  assert.match(summary, /DeepSec pr scan: complete/);
});

test('errored batches (exit 1 with missing analyses, e.g. a gateway 402) stop the scan as an error', async () => {
  const { result } = await scanWith({ skip: ['c.ts'], exit: 1 });
  assert.equal(result.status, 'error');
  assert.match(result.error, /analyzed 2 of 3 files/);
});

test('a scanner that records no run (config failed to load) is an error, not a clean scan', async () => {
  const { result } = await scanWith({ noRun: true });
  assert.equal(result.status, 'error');
  assert.match(result.error, /recorded no run/);
});

test('an unpriced model is skipped before any scanner call, and a spent cap stops at a chunk', async () => {
  const unpriced = await scanWith(
    { noRun: true },
    {
      model: {
        gatewayId: 'acme/unknown',
        agent: 'pi',
        model: 'acme/unknown',
        reasoning: 'high',
      },
    }
  );
  assert.equal(unpriced.result.status, 'error');
  assert.match(unpriced.result.error, /no gateway price.*fail closed/);
  const capped = await scanWith({}, { capUsd: 0.01 });
  assert.equal(capped.result.status, 'partial-budget');
  assert.equal(capped.result.usage.analyses, 0);
});
