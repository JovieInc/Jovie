#!/usr/bin/env node
/**
 * node packages/api-client/cli.ts status [--json]
 *   Per-provider budgets, breakers and last-hour usage for lanes-status/doctor.
 * node packages/api-client/cli.ts gh [--priority P] [--credential ID] -- <gh args>
 *   Run gh through the shared ledger; exit 75 when the call is deferred.
 */
import { pathToFileURL } from 'node:url';

import { PRIORITIES, PROVIDERS, type PriorityName } from './contract.ts';
import { runGh } from './gh.ts';
import {
  liveBucket,
  type ProviderLedger,
  USAGE_FIELDS,
  type Usage,
} from './policy.ts';
import { credentialLabel, defaultStore, type LedgerStore } from './store.ts';

export const STATUS_SCHEMA = 'jovie-api-status/v1';
const HOUR_MS = 3_600_000;

export interface CredentialSummary {
  readonly buckets: Record<
    string,
    { remaining: number; limit: number | null; resetAt: number | null }
  >;
  readonly breaker: { state: string; openUntil: number | null; reason: string };
  readonly usage: Partial<Record<PriorityName, Usage>>;
  readonly lastSeenAt: number;
}

export interface StatusSummary {
  readonly schema: typeof STATUS_SCHEMA;
  readonly observedAt: number;
  readonly providers: Record<
    string,
    { credentials: Record<string, CredentialSummary> }
  >;
}

export function summarize(
  ledgers: readonly ProviderLedger[],
  nowMs: number
): StatusSummary {
  const providers: StatusSummary['providers'] = {};
  for (const ledger of ledgers) {
    const credentials: Record<string, CredentialSummary> = {};
    for (const [id, state] of Object.entries(ledger.credentials)) {
      const buckets: CredentialSummary['buckets'] = {};
      for (const name of Object.keys(state.buckets)) {
        const b = liveBucket(state, name, nowMs);
        if (b)
          buckets[name] = {
            remaining: b.remaining,
            limit: b.limit,
            resetAt: b.resetAt,
          };
      }
      const lastHour: Partial<Record<PriorityName, Usage>> = {};
      for (const hour of [
        Math.floor(nowMs / HOUR_MS),
        Math.floor(nowMs / HOUR_MS) - 1,
      ]) {
        for (const [priority, usage] of Object.entries(
          state.usage[String(hour)] ?? {}
        )) {
          const into = (lastHour[priority as PriorityName] ??=
            Object.fromEntries(USAGE_FIELDS.map(f => [f, 0])) as Usage);
          for (const f of USAGE_FIELDS) into[f] += usage?.[f] ?? 0;
        }
      }
      const { state: breakerState, openUntil, reason } = state.breaker;
      credentials[credentialLabel(id)] = {
        buckets,
        breaker: {
          state: breakerState,
          openUntil: breakerState === 'closed' ? null : openUntil,
          reason,
        },
        usage: lastHour,
        lastSeenAt: state.lastSeenAt,
      };
    }
    if (Object.keys(credentials).length)
      providers[ledger.provider] = { credentials };
  }
  return { schema: STATUS_SCHEMA, observedAt: nowMs, providers };
}

export async function status(
  store: LedgerStore,
  nowMs = Date.now()
): Promise<StatusSummary> {
  return summarize(await Promise.all(PROVIDERS.map(p => store.read(p))), nowMs);
}

function text(summary: StatusSummary): string {
  const lines: string[] = [];
  for (const [provider, value] of Object.entries(summary.providers)) {
    for (const [id, c] of Object.entries(value.credentials)) {
      const buckets = Object.entries(c.buckets)
        .map(([n, b]) => `${n} ${b.remaining}/${b.limit ?? '?'}`)
        .join(', ');
      const shed = Object.values(c.usage).reduce(
        (n, u) => n + (u?.shed ?? 0),
        0
      );
      lines.push(
        `${provider} ${id} breaker=${c.breaker.state} ${buckets || 'no budget observed'} shed/2h=${shed}`
      );
    }
  }
  return lines.length ? lines.join('\n') : 'no API usage recorded on this host';
}

export async function main(argv = process.argv.slice(2)): Promise<number> {
  const [command, ...rest] = argv;
  if (command === 'status') {
    const summary = await status(defaultStore());
    process.stdout.write(
      `${rest.includes('--json') ? JSON.stringify(summary) : text(summary)}\n`
    );
    return 0;
  }
  if (command === 'gh') {
    const split = rest.indexOf('--');
    if (split < 0)
      throw new Error(
        'usage: cli.ts gh [--priority P] [--credential ID] -- <gh args>'
      );
    const flags = rest.slice(0, split);
    const flag = (name: string) => {
      const i = flags.indexOf(name);
      return i >= 0 ? flags[i + 1] : undefined;
    };
    const priority = (flag('--priority') ?? 'default') as PriorityName;
    if (!PRIORITIES.includes(priority))
      throw new Error(`unknown priority ${priority}`);
    const result = await runGh(rest.slice(split + 1), {
      priority,
      credential: flag('--credential'),
    });
    process.stdout.write(result.stdout);
    process.stderr.write(result.stderr);
    return result.code;
  }
  process.stderr.write(
    'usage: cli.ts status [--json] | gh [--priority P] -- <gh args>\n'
  );
  return 2;
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  main().then(
    code => {
      process.exitCode = code;
    },
    error => {
      process.stderr.write(
        `${error instanceof Error ? error.message : error}\n`
      );
      process.exitCode = 2;
    }
  );
}
