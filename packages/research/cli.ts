#!/usr/bin/env node
/**
 * jovie-research: the one research entry point for agents.
 *   jovie-research ask "<question>" [--fresh week] [--mode quick|standard|deep] [--social] [--local] [--json]
 *   jovie-research stats [--days 7] [--json]
 *   jovie-research sources
 */
import { parseArgs } from 'node:util';

import { createProviderClients } from './credentials.ts';
import { renderResult, sourcesTable } from './report.ts';
import { last30daysScript } from './sources-web.ts';
import { summarize } from './state.ts';
import type { Freshness, Mode } from './types.ts';
import { createDefaultWiring } from './wiring.ts';

export const USAGE = `usage: jovie-research <ask|stats|sources> ...
  ask "<question>" [--fresh live|day|week|month|evergreen] [--mode quick|standard|deep]
                   [--social] [--local] [--max-tier 0|1|2] [--refresh] [--no-persist] [--json] [--caller name]
  stats [--days N] [--json]
  sources`;

const FRESH = new Set(['live', 'day', 'week', 'month', 'evergreen']);
const MODES = new Set(['quick', 'standard', 'deep']);

export async function main(
  argv: string[],
  out: (s: string) => void = s => {
    process.stdout.write(`${s}\n`);
  }
): Promise<number> {
  const { values, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: {
      fresh: { type: 'string' },
      mode: { type: 'string' },
      social: { type: 'boolean' },
      local: { type: 'boolean' },
      'max-tier': { type: 'string' },
      refresh: { type: 'boolean' },
      'no-persist': { type: 'boolean' },
      json: { type: 'boolean' },
      caller: { type: 'string' },
      days: { type: 'string' },
      help: { type: 'boolean', short: 'h' },
    },
  });
  const [command, ...rest] = positionals;
  if (!command || values.help) {
    out(USAGE);
    return command ? 0 : 64;
  }
  const wiring = createDefaultWiring();
  const print = (value: unknown) =>
    out(typeof value === 'string' ? value : JSON.stringify(value, null, 2));

  if (command === 'ask') {
    const query = rest.join(' ').trim();
    if (!query) throw new UsageError('ask needs a question');
    if (values.fresh && !FRESH.has(values.fresh))
      throw new UsageError(`bad --fresh ${values.fresh}`);
    if (values.mode && !MODES.has(values.mode))
      throw new UsageError(`bad --mode ${values.mode}`);
    const result = await wiring.router.research({
      query,
      freshness: values.fresh as Freshness | undefined,
      mode: values.mode as Mode | undefined,
      social: values.social,
      localOnly: values.local,
      maxTier:
        values['max-tier'] === undefined
          ? undefined
          : Number(values['max-tier']),
      refresh: values.refresh,
      persist: !values['no-persist'],
      caller: values.caller ?? process.env.JOVIE_AGENT_PROFILE ?? 'cli',
    });
    print(values.json ? result : renderResult(result));
    return 0;
  }
  if (command === 'stats') {
    const days = Number(values.days ?? 7);
    const stats = summarize(
      await wiring.state.readMetrics(),
      Date.now() - days * 86_400_000
    );
    print(
      values.json
        ? stats
        : `last ${days}d: ${stats.runs} runs, cache hit ${(stats.cacheHitRate * 100).toFixed(0)}%, $${stats.usd.toFixed(4)}, avg ${stats.avgMs}ms\n${JSON.stringify({ byCache: stats.byCache, byMode: stats.byMode, sourceUse: stats.sourceUse })}`
    );
    return 0;
  }
  if (command === 'sources') {
    const clients = createProviderClients();
    const cf = (await clients.cloudflare()) !== null;
    print(
      await sourcesTable(wiring.state, {
        gbrain: true,
        repo: true,
        'cloudflare-fetch': cf,
        'clef-flash': cf,
        firecrawl: clients.firecrawl() !== null,
        last30days: last30daysScript() !== null,
        hyperagent: clients.hyperagent() !== null,
        exa: clients.exa() !== null,
        perplexity: clients.perplexity() !== null,
        jev: clients.gateway() !== null,
      })
    );
    return 0;
  }
  throw new UsageError(`unknown command ${command}`);
}

export class UsageError extends Error {}

if (
  import.meta.url === `file://${process.argv[1]}` ||
  process.argv[1]?.endsWith('/jovie-research')
) {
  main(process.argv.slice(2)).then(
    code => {
      process.exitCode = code;
    },
    (error: Error) => {
      process.stderr.write(`jovie-research: ${error.message}\n`);
      process.exitCode = error instanceof UsageError ? 64 : 75;
    }
  );
}
