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
import { readFileSync, writeFileSync } from 'node:fs';
import { parseArgs } from 'node:util';

import { loadQuestions, renderBench, runBench } from './bench.ts';
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
import { callSource, GATEWAY_SOURCES, type GatewaySource } from './gateway.ts';
import { serveMcp } from './mcp.ts';
import { renderResult, sourcesTable } from './report.ts';
import { triageSignals } from './signals.ts';
import { last30daysScript } from './sources-web.ts';
import { summarize } from './state.ts';
import type { Freshness, Mode } from './types.ts';
import { createDefaultWiring } from './wiring.ts';

export const USAGE = `usage: jovie-research <ask|stats|sources|decision|call|bench|triage-signals|mcp> ...
  ask "<question>" [--fresh live|day|week|month|evergreen] [--mode quick|standard|deep]
                   [--social] [--local] [--max-tier 0|1|2] [--refresh] [--no-persist] [--json] [--caller name]
  stats [--days N] [--json]
  sources
  decision find "<topic>" | record --file <json> | trigger --kind <k> --trigger "<t>" [--topic t] [--evidence r]... [--dry-run]
           | resolve <review-slug> --kept|--superseded [--evidence r] | check <slug>
  call <exa|firecrawl|cloudflare> <METHOD> <path> [--body <json|@file>] [--units N] [--cache-ttl-ms N] [--caller name]
  bench [--questions file.json] [--baseline exa,exa:fast,firecrawl] [--judge jev] [--label name] [--out file.json]
  triage-signals [--dry-run] [--since <iso>] [--min-score 0.6] [--limit N]
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
      body: { type: 'string' },
      units: { type: 'string' },
      'cache-ttl-ms': { type: 'string' },
      questions: { type: 'string' },
      baseline: { type: 'string' },
      judge: { type: 'string' },
      label: { type: 'string' },
      out: { type: 'string' },
      since: { type: 'string' },
      'min-score': { type: 'string' },
      limit: { type: 'string' },
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
    await wiring.router.flush();
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
  if (command === 'call') {
    const [source, method, path] = rest;
    if (
      !GATEWAY_SOURCES.includes(source as GatewaySource) ||
      !method ||
      !path?.startsWith('/')
    )
      throw new UsageError('call <exa|firecrawl|cloudflare> <METHOD> </path>');
    const raw = values.body?.startsWith('@')
      ? readFileSync(values.body.slice(1), 'utf8')
      : values.body;
    const result = await callSource(wiring, source as GatewaySource, {
      method,
      path,
      body: raw === undefined ? undefined : JSON.parse(raw),
      units: values.units === undefined ? undefined : Number(values.units),
      cacheTtlMs:
        values['cache-ttl-ms'] === undefined
          ? undefined
          : Number(values['cache-ttl-ms']),
      caller: values.caller ?? process.env.JOVIE_AGENT_PROFILE ?? 'cli',
    });
    out(
      typeof result.body === 'string'
        ? result.body
        : JSON.stringify(result.body)
    );
    return result.status >= 400 ? 1 : 0;
  }
  if (command === 'bench') {
    const judgeName = values.judge ?? 'jev';
    const judge = wiring.judge(judgeName);
    if (!judge) throw new UsageError(`unknown judge ${judgeName}`);
    const label = values.label ?? new Date().toISOString().slice(0, 10);
    const { rows, summary } = await runBench(
      { ...wiring, judge },
      {
        questions: loadQuestions(values.questions),
        baselines: (values.baseline ?? 'exa').split(',').filter(Boolean),
        label,
        log: row => process.stderr.write(`${JSON.stringify(row)}\n`),
      }
    );
    if (values.out)
      writeFileSync(
        values.out,
        JSON.stringify({ label, judge: judgeName, rows, summary }, null, 2)
      );
    print(values.json ? summary : renderBench(label, summary, rows.length));
    return 0;
  }
  if (command === 'triage-signals') {
    const result = await triageSignals(wiring, {
      dryRun: values['dry-run'],
      since: values.since,
      minScore:
        values['min-score'] === undefined
          ? undefined
          : Number(values['min-score']),
      limit: values.limit === undefined ? undefined : Number(values.limit),
    });
    print(
      values.json
        ? result
        : `signals scanned ${result.scanned}, actionable ${result.actionable}, reviews ${result.reviews.length}${result.reviews.map(r => `\n  ${r.signal} -> ${r.decision} -> ${r.review ?? '(dry run)'}`).join('')}`
    );
    return 0;
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
