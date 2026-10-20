#!/usr/bin/env node
/**
 * jovie-research: the one research entry point for agents.
 *   jovie-research ask "<question>" [--fresh week] [--mode quick|standard|deep] [--social] [--local] [--json]
 *   jovie-research stats [--days 7] [--json]
 *   jovie-research sources
 *   jovie-research decision find "<topic>"
 *   jovie-research decision record --file decision.json
 *   jovie-research decision trigger --kind model --trigger "<what changed>" [--topic ..] [--evidence url]... [--dry-run]
 *   jovie-research decision resolve <review-slug> --kept|--superseded [--evidence ref]
 *   jovie-research decision check <slug>
 *   jovie-research mcp
 */
import { readFileSync } from 'node:fs';
import { parseArgs } from 'node:util';

import { createProviderClients } from './credentials.ts';
import {
  checkDecision,
  type DecisionInput,
  findDecisions,
  proposeReviews,
  recordDecision,
  resolveReview,
  type TriggerKind,
} from './decisions.ts';
import { serveMcp } from './mcp.ts';
import { renderResult, sourcesTable } from './report.ts';
import { last30daysScript } from './sources-web.ts';
import { summarize } from './state.ts';
import type { Freshness, Mode } from './types.ts';
import { createDefaultWiring } from './wiring.ts';

export const USAGE = `usage: jovie-research <ask|stats|sources|decision|mcp> ...
  ask "<question>" [--fresh live|day|week|month|evergreen] [--mode quick|standard|deep]
                   [--social] [--local] [--max-tier 0|1|2] [--refresh] [--no-persist] [--json] [--caller name]
  stats [--days N] [--json]
  sources
  decision find "<topic>" | record --file <json> | trigger --kind <k> --trigger "<t>" [--topic t] [--evidence r]... [--dry-run]
           | resolve <review-slug> --kept|--superseded [--evidence r] | check <slug>
  mcp`;

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
      file: { type: 'string' },
      kind: { type: 'string' },
      trigger: { type: 'string' },
      topic: { type: 'string' },
      evidence: { type: 'string', multiple: true },
      'dry-run': { type: 'boolean' },
      kept: { type: 'boolean' },
      superseded: { type: 'boolean' },
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
  if (command === 'decision') {
    const [sub, arg] = rest;
    if (sub === 'find' && arg) {
      const rows = await findDecisions(wiring.gbrain, rest.slice(1).join(' '));
      print(
        rows
          .map(r => `${r.slug} (${r.status ?? '?'}) ${r.title ?? ''}`)
          .join('\n') || 'No decisions found.'
      );
      return 0;
    }
    if (sub === 'record' && values.file) {
      const input = JSON.parse(
        readFileSync(values.file, 'utf8')
      ) as DecisionInput;
      print(await recordDecision(wiring.gbrain, input));
      return 0;
    }
    if (sub === 'trigger' && values.trigger && values.kind) {
      const rows = await proposeReviews(wiring.gbrain, {
        trigger: values.trigger,
        kind: values.kind as TriggerKind,
        topic: values.topic,
        evidence: values.evidence ?? [],
        dryRun: values['dry-run'],
      });
      print(
        values.json
          ? rows
          : rows
              .map(
                r =>
                  `${r.decision} -> ${r.review ?? '(dry run)'} (${r.score.toFixed(2)})`
              )
              .join('\n') || 'No decisions matched.'
      );
      return 0;
    }
    if (sub === 'resolve' && arg && (values.kept || values.superseded)) {
      await resolveReview(
        wiring.gbrain,
        arg,
        values.kept ? 'kept' : 'superseded',
        values.evidence ?? []
      );
      print(`resolved ${arg}`);
      return 0;
    }
    if (sub === 'check' && arg) {
      print(await checkDecision(wiring.gbrain, arg));
      return 0;
    }
    throw new UsageError(`bad decision command: ${rest.join(' ')}`);
  }
  if (command === 'mcp') {
    await serveMcp(wiring);
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
