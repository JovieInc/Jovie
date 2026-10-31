#!/usr/bin/env node
/**
 * node scripts/rate-limit-headroom.mjs [--json] [--write] [--no-live]
 *
 * One headroom view per rate limit, for planning and for Summer / Ovie:
 *   registry (ops/registry/rate-limits.json)  limit, basis, consumers
 * + declared budgets (`api-budget:` lines in the repo)   planned calls/hour
 * + live reads: GitHub rate_limit (free endpoint) for the user and App tokens,
 *   and the host ledger ($LANES_STATE/api-ledger via `packages/api-client status`).
 * --write publishes the result to $LANES_STATE/api-ledger/headroom.json
 * (default ~/.local/state/jovie-lanes), the file Summer and Ovie read.
 * Read-only; never prints a credential.
 *
 * Cadence is the six-hourly credentials tick, plus manual reads. GET /rate_limit
 * does not spend a bucket; the ceiling still covers the app-token mint.
 * api-budget: github-user-core 1/hr - six-hourly headroom probe; rate_limit is uncounted
 * api-budget: github-app-core 1/hr - six-hourly app token mint plus rate_limit probe
 */
import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { loadRateLimits, parseBudgets } from './lib/api-budget.mjs';

export const HEADROOM_SCHEMA = 'jovie-rate-headroom/v1';
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const HOUR = { hour: 1, minute: 60 };

export function stateRoot(env = process.env) {
  return env.LANES_STATE || join(homedir(), '.local/state/jovie-lanes');
}

function trackedFiles(repoRoot) {
  const listed = spawnSync('git', ['ls-files', '-z'], {
    cwd: repoRoot,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });
  // An installed lanes release is not a git checkout: no declared budgets there.
  return listed.status === 0 ? listed.stdout.split('\0').filter(Boolean) : [];
}

/** Declared calls/hour per limit id, and which files declare them. */
export function declaredBudgets(repoRoot, files = trackedFiles(repoRoot)) {
  const out = {};
  for (const path of files) {
    if (!/\.(?:ts|tsx|js|mjs|cjs|py|sh|bash|ya?ml|md)$/.test(path)) continue;
    let text;
    try {
      text = readFileSync(join(repoRoot, path), 'utf8');
    } catch {
      continue;
    }
    if (!text.includes('api-budget:')) continue;
    for (const b of parseBudgets(text)) {
      const row = (out[b.limit] ??= { perHour: 0, declaredBy: [] });
      row.perHour += b.perHour;
      row.declaredBy.push({ path, perHour: b.perHour });
    }
  }
  return out;
}

/** Pure join of registry, declared budgets and live readings. */
export function buildHeadroom({ registry, declared, live, ledger, nowMs }) {
  const t = registry.thresholds;
  const limits = registry.limits.map(l => {
    const reading = live[l.id] ?? ledgerReading(ledger, l);
    const perHourLimit =
      l.limit && HOUR[l.window]
        ? l.limit * HOUR[l.window]
        : l.window === 'hour'
          ? l.limit
          : null;
    const planned = declared[l.id] ?? { perHour: 0, declaredBy: [] };
    const plannedPct =
      perHourLimit && planned.perHour > 0 && l.window === 'hour'
        ? Math.round((planned.perHour / perHourLimit) * 100)
        : null;
    const usedPct =
      reading?.limit && reading.remaining != null
        ? Math.round(
            ((reading.limit - reading.remaining) / reading.limit) * 100
          )
        : null;
    let status = 'unknown';
    if (usedPct != null || plannedPct != null) {
      const worst = Math.max(usedPct ?? 0, plannedPct ?? 0);
      status =
        worst >= (usedPct != null ? t.liveCriticalPct : t.plannedFailPct)
          ? 'critical'
          : worst >= (usedPct != null ? t.liveWarnPct : t.plannedWarnPct)
            ? 'warn'
            : 'ok';
    }
    return {
      id: l.id,
      provider: l.provider,
      limit: l.limit,
      unit: l.unit,
      window: l.window,
      basis: l.basis,
      remaining: reading?.remaining ?? null,
      usedPct,
      resetAt: reading?.resetAt ?? null,
      observedAt: reading?.observedAt ?? null,
      liveSource: reading?.source ?? null,
      plannedCallsPerHour: planned.perHour,
      plannedPct,
      declaredBy: planned.declaredBy.length,
      status,
      consumers: l.consumers,
    };
  });
  return {
    schema: HEADROOM_SCHEMA,
    observedAt: nowMs,
    limits,
    gaps: limits
      .filter(
        l =>
          l.basis === 'unmeasured' ||
          (l.limit && l.remaining == null && l.basis !== 'documented')
      )
      .map(l => l.id),
  };
}

function ledgerReading(ledger, l) {
  if (!l.ledger) return null;
  const creds = ledger?.providers?.[l.ledger.provider]?.credentials ?? {};
  let best = null;
  for (const c of Object.values(creds)) {
    const b = c.buckets?.[l.ledger.resource];
    if (
      b &&
      Date.now() - (b.observedAt ?? 0) < 24 * 3600e3 &&
      (!best || (b.observedAt ?? 0) > (best.observedAt ?? 0))
    )
      best = {
        limit: b.limit,
        remaining: b.remaining,
        resetAt: b.resetAt,
        observedAt: b.observedAt ?? c.lastSeenAt,
        source: 'ledger',
      };
  }
  return best;
}

function run(cmd, args, env) {
  const r = spawnSync(cmd, args, {
    cwd: root,
    encoding: 'utf8',
    env: { ...process.env, ...env },
    timeout: 30000,
  });
  return r.status === 0 ? r.stdout : null;
}

/** GitHub's rate_limit endpoint does not count against any bucket. */
function githubLive(nowMs) {
  const live = {};
  const read = (credential, env) => {
    const out = run(
      'node',
      [
        'packages/api-client/cli.ts',
        'gh',
        '--priority',
        'report',
        '--',
        'api',
        'rate_limit',
      ],
      env
    );
    if (!out) return;
    const res = JSON.parse(out).resources ?? {};
    for (const [resource, id] of [
      ['core', 'core'],
      ['graphql', 'graphql'],
      ['search', 'search'],
    ]) {
      const r = res[resource];
      if (r)
        live[
          id === 'search'
            ? 'github-search'
            : `github-${credential === 'gh-user' ? 'user' : 'app'}-${id}`
        ] = {
          limit: r.limit,
          remaining: r.remaining,
          resetAt: r.reset * 1000,
          observedAt: nowMs,
          source: 'github-rate-limit',
        };
    }
  };
  read('gh-user', {});
  const token = run('python3', ['scripts/lanes/gh_app_token.py'], {});
  if (token) read('gh-app', { GH_TOKEN: token.trim().split('\n').pop() });
  return live;
}

export function main(argv = process.argv.slice(2)) {
  const nowMs = Date.now();
  const registry = loadRateLimits(root);
  const status = run(
    'node',
    ['packages/api-client/cli.ts', 'status', '--json'],
    {}
  );
  const headroom = buildHeadroom({
    registry,
    declared: declaredBudgets(root),
    live: argv.includes('--no-live') ? {} : githubLive(nowMs),
    ledger: status ? JSON.parse(status) : null,
    nowMs,
  });
  if (argv.includes('--write')) {
    const dir = join(stateRoot(), 'api-ledger');
    mkdirSync(dir, { recursive: true });
    const tmp = join(dir, `.headroom.${process.pid}.tmp`);
    writeFileSync(tmp, `${JSON.stringify(headroom, null, 2)}\n`);
    renameSync(tmp, join(dir, 'headroom.json'));
  }
  if (argv.includes('--json')) {
    process.stdout.write(`${JSON.stringify(headroom, null, 2)}\n`);
  } else {
    for (const l of headroom.limits) {
      const live =
        l.usedPct != null
          ? `${l.remaining}/${l.limit} left (${l.usedPct}% used)`
          : 'no live read';
      const plan = l.plannedCallsPerHour
        ? ` planned ${l.plannedCallsPerHour}/hr${l.plannedPct != null ? ` (${l.plannedPct}%)` : ''}`
        : '';
      process.stdout.write(
        `${l.status.padEnd(8)} ${l.id.padEnd(22)} ${live}${plan}\n`
      );
    }
    if (headroom.gaps.length)
      process.stdout.write(`gaps: ${headroom.gaps.join(', ')}\n`);
  }
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  process.exitCode = main();
