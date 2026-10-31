#!/usr/bin/env node
/**
 * node scripts/ai-routing-check.mjs [--days 2] [--json] [--record <jsonl>] [--vercel]
 *
 * Compares the documented AI routing (apps/web/lib/ai/routing.json) with the
 * live deployment: Gateway spend by key and model against each caller's declared
 * ceiling, the Workers AI relay health, the Vercel env flags that switch a route
 * on, and Gateway credit runway (page under 3 days). Exits 1 on any high or
 * critical finding. --record appends the per-provider $/day snapshot (measure
 * everything) to a JSONL ledger. Reads AI_GATEWAY_API_KEY from the environment
 * and never prints it.
 *
 * api-budget: ai-gateway 16/hr - cost-gate tick every 15 min, 2 report reads and 1 credits read per run
 * api-budget: cloudflare-api 8/hr - one Workers AI analytics query per cost-gate tick
 */
import { spawnSync } from 'node:child_process';
import { appendFileSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createApiClient } from '../packages/api-client/client.ts';
import { providerSpec } from '../packages/api-client/contract.ts';
import { hashCredential } from '../packages/api-client/store.ts';
import { fetchRows } from './ai-gateway-report.mjs';
import { evaluateRouting, workersAiUsdByDay } from './lib/ai-routing-drift.mjs';
import { readGatewayCredits } from './lib/credentials-live-reads.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const ROUTING_PATH = resolve(ROOT, 'apps/web/lib/ai/routing.json');
/** Public, unauthenticated /health of each relay Worker the routing depends on. */
export const RELAYS = {
  'jovie-workers-ai': 'https://jovie-workers-ai.tim-fd8.workers.dev/health',
  'summer-workers-ai': 'https://summer-workers-ai.tim-fd8.workers.dev/health',
};

async function relayHealth(fetchImpl) {
  const out = {};
  for (const [name, url] of Object.entries(RELAYS)) {
    try {
      const res = await fetchImpl(url, { signal: AbortSignal.timeout(8000) });
      out[name] = res.ok ? 'ok' : `http-${res.status}`;
    } catch (error) {
      out[name] = error instanceof Error ? error.name : 'unreachable';
    }
  }
  return out;
}

const CLOUDFLARE_ACCOUNT_ID = 'fd8a6fcfa0ff0b708dbae942af18c49b';

/**
 * Workers AI usage by day from Cloudflare's GraphQL analytics (neurons x list
 * price; billed against the startup credits). Optional: needs CLOUDFLARE_API_TOKEN
 * or a local wrangler login, so CI without either reports null.
 */
export async function readWorkersAiByDay(days, fetchImpl, env = process.env) {
  const tokens = [];
  if (env.CLOUDFLARE_API_TOKEN) tokens.push(env.CLOUDFLARE_API_TOKEN);
  const login = spawnSync('wrangler', ['auth', 'token'], {
    encoding: 'utf8',
    timeout: 30_000,
  });
  if (login.status === 0) tokens.push(login.stdout.trim().split('\n').pop());
  const since = new Date(Date.now() - days * 864e5).toISOString();
  const until = new Date(Date.now() + 864e5).toISOString();
  const query = `query { viewer { accounts(filter:{accountTag:"${CLOUDFLARE_ACCOUNT_ID}"}) { aiInferenceAdaptiveGroups(limit:200, filter:{datetime_geq:"${since}", datetime_leq:"${until}"}) { dimensions { date } sum { totalNeurons } } } } }`;
  // A scoped API token may lack analytics access; fall through to the next one.
  for (const token of tokens) {
    try {
      // Through the shared client layer (budget, retry, ledger), like every provider call.
      const client = createApiClient({
        provider: 'cloudflare',
        credential: hashCredential('cloudflare', token),
        fetch: fetchImpl,
      });
      const res = await client.request({
        url: `https://${providerSpec('cloudflare').hosts[0]}/client/v4/graphql`,
        method: 'POST',
        headers: {
          authorization: `Bearer ${token}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({ query }),
        priority: 'report',
        maxAttempts: 1,
      });
      if (res.status < 200 || res.status >= 300) continue;
      const body =
        /** @type {{ data?: { viewer?: { accounts?: { aiInferenceAdaptiveGroups?: unknown }[] } } } | null} */ (
          res.json()
        );
      const groups =
        body?.data?.viewer?.accounts?.[0]?.aiInferenceAdaptiveGroups;
      if (Array.isArray(groups)) return workersAiUsdByDay(groups);
    } catch {
      // try the next token
    }
  }
  return null;
}

/** Production env NAMES (never values) for each project a route declares. */
function vercelEnvNames(routing) {
  const out = {};
  const projects = new Set(
    (routing.callers ?? [])
      .map(caller => caller.liveFlags?.vercelProject)
      .filter(Boolean)
  );
  for (const project of projects) {
    const res = spawnSync(
      'vercel',
      ['env', 'ls', 'production', '--project', project],
      { encoding: 'utf8', timeout: 60_000 }
    );
    if (res.status !== 0) continue;
    out[project] = res.stdout
      .split('\n')
      .map(line => line.trim().split(/\s+/u)[0])
      .filter(name => /^[A-Z][A-Z0-9_]+$/u.test(name));
  }
  return out;
}

export async function main(
  argv = process.argv.slice(2),
  env = process.env,
  fetchImpl = fetch
) {
  const apiKey = env.AI_GATEWAY_API_KEY;
  if (!apiKey) {
    console.error('ai-routing-check: AI_GATEWAY_API_KEY is not set');
    return 2;
  }
  const flag = name => {
    const i = argv.indexOf(name);
    return i >= 0 ? argv[i + 1] : undefined;
  };
  const days = Number(flag('--days')) || 2;
  const routing = JSON.parse(readFileSync(ROUTING_PATH, 'utf8'));
  // fetchRows spans start_date = today - n through tomorrow, so n days back is
  // n + 1 calendar days. Ask for days - 1 so the per-day rate divides the
  // window it measured (it read a stale day and over-reported by ~50%).
  const span = Math.max(0, days - 1);
  const [keyRows, modelRows] = await Promise.all([
    fetchRows('api_key_name', span, apiKey, fetchImpl),
    fetchRows('model', span, apiKey, fetchImpl),
  ]);
  const creditsRead = await readGatewayCredits({
    token: apiKey,
    fetchImpl,
    now: Date.now,
  });
  const result = evaluateRouting({
    routing,
    keyRows,
    modelRows,
    days,
    credits: creditsRead.ok ? creditsRead.value : null,
    health: await relayHealth(fetchImpl),
    envNames: argv.includes('--vercel') ? vercelEnvNames(routing) : null,
    workersAiByDay: await readWorkersAiByDay(days, fetchImpl, env),
  });
  const record = {
    ...result,
    checkedAt: new Date().toISOString(),
    gatewayBalanceUsd: creditsRead.ok ? creditsRead.value.balanceUsd : null,
  };
  const ledger = flag('--record');
  if (ledger) appendFileSync(ledger, `${JSON.stringify(record)}\n`);
  if (argv.includes('--json')) console.log(JSON.stringify(record, null, 2));
  else {
    console.log(
      `AI routing check (last ${days}d): Gateway $${result.gatewayUsdPerDay}/day, Workers AI $${result.workersAiUsdPerDay ?? 'n/a'}/day, Gateway runway ${result.runwayDays ?? 'n/a'} days`
    );
    for (const [key, v] of Object.entries(result.byKey))
      console.log(
        `  ${key.padEnd(34)} $${v.usdPerDay}/day  ceiling ${v.ceilingUsdPerDay ?? 'undeclared'}`
      );
    for (const f of result.findings)
      console.log(`  [${f.severity}] ${f.message}`);
    if (result.findings.length === 0) console.log('  no drift');
  }
  return result.findings.some(f => ['high', 'critical'].includes(f.severity))
    ? 1
    : 0;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href)
  main().then(code => process.exit(code));
