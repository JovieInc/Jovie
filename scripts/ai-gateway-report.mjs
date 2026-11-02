#!/usr/bin/env node
/**
 * node scripts/ai-gateway-report.mjs [--days 7] [--json]
 *
 * Per-caller (`api_key_name`) and per-`tag` AI Gateway cost, $/day and cache-hit
 * share from the Gateway spend report. Reads AI_GATEWAY_API_KEY from the
 * environment and never prints it. Feeds the capacity/spend loop.
 */
import { pathToFileURL } from 'node:url';
import { createApiClient } from '../packages/api-client/client.ts';
import { providerSpec } from '../packages/api-client/contract.ts';
import { hashCredential } from '../packages/api-client/store.ts';

// The host comes from the api-client provider contract, never a literal.
const BASE = `https://${providerSpec('ai-gateway').hosts[0]}/v1/report`;

export function summarize(rows, days) {
  return rows
    .map(r => {
      const prompt = (r.input_tokens ?? 0) + (r.cached_input_tokens ?? 0);
      return {
        key: r.api_key_name ?? r.tag ?? '',
        costUsd: r.total_cost ?? 0,
        usdPerDay: (r.total_cost ?? 0) / days,
        requests: r.request_count ?? 0,
        promptTokensPerRequest: r.request_count
          ? prompt / r.request_count
          : null,
        reasoningTokensPerRequest: r.request_count
          ? (r.reasoning_tokens ?? 0) / r.request_count
          : null,
        cacheHit: prompt ? (r.cached_input_tokens ?? 0) / prompt : null,
      };
    })
    .sort((a, b) => b.costUsd - a.costUsd);
}

export async function fetchRows(groupBy, days, apiKey, fetchImpl = fetch) {
  const day = ms => new Date(Date.now() + ms).toISOString().slice(0, 10);
  const url = `${BASE}?start_date=${day(-days * 864e5)}&end_date=${day(864e5)}&group_by=${groupBy}`;
  // Every provider call goes through the shared client layer (budget, retry, ledger).
  const client = createApiClient({
    provider: 'ai-gateway',
    credential: hashCredential('ai-gateway', apiKey),
    fetch: fetchImpl,
  });
  const res = await client.request({
    url,
    headers: { authorization: `Bearer ${apiKey}` },
    priority: 'report',
    maxAttempts: 2,
  });
  if (res.status < 200 || res.status >= 300)
    throw new Error(`gateway report ${res.status}`);
  return /** @type {{ results?: object[] }} */ (res.json()).results ?? [];
}

export async function main(argv = process.argv.slice(2), env = process.env) {
  const apiKey = env.AI_GATEWAY_API_KEY;
  if (!apiKey) {
    console.error('ai-gateway-report: AI_GATEWAY_API_KEY is not set');
    return 1;
  }
  const i = argv.indexOf('--days');
  const days = i >= 0 ? Number(argv[i + 1]) || 7 : 7;
  const report = {};
  for (const groupBy of ['api_key_name', 'tag'])
    report[groupBy] = summarize(await fetchRows(groupBy, days, apiKey), days);
  if (argv.includes('--json')) console.log(JSON.stringify(report, null, 2));
  else
    for (const [groupBy, lines] of Object.entries(report)) {
      console.log(`\n${groupBy} (last ${days}d)`);
      for (const l of lines.slice(0, 15))
        console.log(
          `  ${(l.key || '(untagged)').padEnd(42)} $${l.usdPerDay.toFixed(2)}/day  ${l.requests} req  cache ${l.cacheHit === null ? 'n/a' : `${Math.round(l.cacheHit * 100)}%`}  reasoning/req ${Math.round(l.reasoningTokensPerRequest ?? 0)}`
        );
    }
  return 0;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href)
  main().then(code => process.exit(code));
