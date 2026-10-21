/**
 * Bridges the lanes state files that predate the ledger, so there is one
 * budget, not two competing ones, until the lanes migrate:
 * - github-budget.json  (gh shim's GraphQL floor, scripts/lanes/gh_app_token.py)
 * - linear-cooldown/<scope>/<resetAt>-<id>.json (Python lanes + scripts/lib/linear-cooldown.mjs)
 * - api-budget.json      (Linear snapshot read by lanes doctor/autoscale)
 * The bridge reads them as observations and writes them back as projections.
 */
import { randomUUID } from 'node:crypto';
import * as fs from 'node:fs/promises';
import { join } from 'node:path';

import type { LedgerHooks } from './client.ts';
import type { Failure } from './headers.ts';
import type { CredentialState } from './policy.ts';

async function readJson(path: string): Promise<unknown> {
  try {
    return JSON.parse(await fs.readFile(path, 'utf8'));
  } catch {
    return null;
  }
}

async function writeJson(
  path: string,
  value: unknown,
  mode = 0o600
): Promise<void> {
  try {
    const tmp = `${path}.${process.pid}.${randomUUID()}.tmp`;
    await fs.writeFile(tmp, JSON.stringify(value), { mode });
    await fs.rename(tmp, path);
  } catch {
    // a projection is advisory; the ledger already holds the truth
  }
}

/** github-budget.json: {remaining, resetAt (epoch s), observedAt (epoch s)} for GraphQL. */
export function githubBudgetHooks(stateRoot: string): LedgerHooks {
  const path = join(stateRoot, 'github-budget.json');
  return {
    prepare: () => readJson(path),
    merge(state, prepared, nowMs) {
      const file = prepared as {
        remaining?: unknown;
        resetAt?: unknown;
        observedAt?: unknown;
      } | null;
      if (
        !file ||
        typeof file.remaining !== 'number' ||
        typeof file.resetAt !== 'number'
      )
        return;
      const observedAt =
        typeof file.observedAt === 'number' ? file.observedAt * 1000 : 0;
      const resetAt = file.resetAt * 1000;
      const current = state.buckets.graphql;
      if (resetAt <= nowMs || (current && current.observedAt >= observedAt))
        return;
      // The shim file carries no limit; GitHub's GraphQL bucket is 5,000 points/hour.
      state.buckets.graphql = {
        limit: current?.limit ?? 5000,
        remaining: file.remaining,
        resetAt,
        observedAt,
      };
    },
    async publish(state, _failure, nowMs) {
      const bucket = state.buckets.graphql;
      if (!bucket || bucket.resetAt === null || bucket.observedAt !== nowMs)
        return;
      await writeJson(path, {
        remaining: bucket.remaining,
        resetAt: Math.floor(bucket.resetAt / 1000),
        observedAt: nowMs / 1000,
      });
    },
  };
}

async function latestCooldown(dir: string, nowMs: number): Promise<number> {
  let latest = 0;
  let names: string[] = [];
  try {
    names = await fs.readdir(dir);
  } catch {
    return 0;
  }
  for (const name of names.slice(0, 1000)) {
    const match = /^(\d+)-[0-9a-f-]+\.json$/.exec(name);
    if (match && Number(match[1]) > nowMs)
      latest = Math.max(latest, Number(match[1]));
  }
  return latest;
}

/** `scope` is sha256(LINEAR_API_URL + NUL + identity), the lanes cooldown scope. */
export function linearLegacyHooks(
  stateRoot: string,
  scope: string
): LedgerHooks {
  const cooldownDir = join(stateRoot, 'linear-cooldown', scope);
  const budgetPath = join(stateRoot, 'api-budget.json');
  return {
    prepare: async () => latestCooldown(cooldownDir, 0),
    merge(state: CredentialState, prepared, nowMs) {
      const resetAt = typeof prepared === 'number' ? prepared : 0;
      const current = state.buckets.requests;
      if (
        resetAt <= nowMs ||
        (current?.remaining === 0 && (current.resetAt ?? 0) >= resetAt)
      )
        return;
      state.buckets.requests = {
        limit: current?.limit ?? null,
        remaining: 0,
        resetAt,
        observedAt: nowMs,
      };
    },
    async publish(state, failure: Failure, nowMs) {
      const requests = state.buckets.requests;
      const complexity = state.buckets.complexity;
      if (failure.kind === 'primary' && requests?.resetAt) {
        await fs
          .mkdir(cooldownDir, { recursive: true, mode: 0o700 })
          .catch(() => undefined);
        await writeJson(
          join(cooldownDir, `${requests.resetAt}-${randomUUID()}.json`),
          {
            schema: 1,
            resetAt: requests.resetAt,
          }
        );
      }
      if (!requests || requests.observedAt !== nowMs) return;
      const iso = new Date(nowMs).toISOString().replace(/\.\d{3}Z$/, 'Z');
      const previous = (await readJson(budgetPath)) as {
        rateLimitedAt?: string;
      } | null;
      const dim = (b: typeof requests | undefined) =>
        b
          ? {
              remaining: b.remaining,
              limit: b.limit,
              reset: b.resetAt,
              observedAt: iso,
            }
          : null;
      await writeJson(budgetPath, {
        schema: 1,
        scope,
        remaining: requests.remaining,
        limit: requests.limit,
        reset: requests.resetAt,
        rateLimitedAt:
          failure.kind === 'primary' ? iso : (previous?.rateLimitedAt ?? null),
        observedAt: iso,
        dimensions: { requests: dim(requests), complexity: dim(complexity) },
      });
    },
  };
}

export function combineHooks(...all: LedgerHooks[]): LedgerHooks {
  return {
    prepare: async () => Promise.all(all.map(h => h.prepare?.())),
    merge(state, prepared, nowMs) {
      all.forEach((h, i) =>
        h.merge?.(state, (prepared as unknown[])[i], nowMs)
      );
    },
    async publish(state, failure, nowMs) {
      for (const h of all) await h.publish?.(state, failure, nowMs);
    },
  };
}
