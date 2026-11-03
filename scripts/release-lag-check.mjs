#!/usr/bin/env node
// Dead-man for release lag: alert when production has not advanced for N hours
// while main has. A green Production Controller run proves nothing here, because
// Coalesce can skip the whole release as "superseded" (2026-10-26: a 5-hour stall
// behind a blocking LCP gate looked green). Reads only the public build-info
// receipt and the local git checkout; the GitHub API is touched only to name the
// blocking step, and only when lagging.
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

export const DEFAULT_MAX_LAG_HOURS = 3;

/**
 * firstUnshippedMs: commit time of the oldest main commit not in production
 * (undefined when production already contains main). The build-info deployedAt
 * field is the response time, not the deploy time, so it cannot be used.
 * @param {{ prodSha: string, mainSha: string, firstUnshippedMs?: number, nowMs: number, maxLagHours?: number }} input
 */
export function evaluateReleaseLag({
  prodSha,
  mainSha,
  firstUnshippedMs,
  nowMs,
  maxLagHours = DEFAULT_MAX_LAG_HOURS,
}) {
  if (!prodSha)
    return { ok: false, reason: 'production build-info is unreadable' };
  if (prodSha === mainSha || !Number.isFinite(firstUnshippedMs))
    return { ok: true, reason: 'production contains main head' };
  const stalledHours = (nowMs - firstUnshippedMs) / 3_600_000;
  if (stalledHours < maxLagHours)
    return {
      ok: true,
      reason: `oldest unshipped main commit is ${stalledHours.toFixed(1)}h old`,
    };
  return {
    ok: false,
    stalledHours,
    reason: `production ${prodSha.slice(0, 7)} has not advanced for ${stalledHours.toFixed(1)}h while main moved to ${mainSha.slice(0, 7)} (limit ${maxLagHours}h)`,
  };
}

/** Name the failed job/step of the newest controller run that attempted a release. */
export function findBlocker(runs, jobsFor) {
  for (const run of runs) {
    if (run.conclusion !== 'failure') continue;
    const failed = jobsFor(run.databaseId).find(
      j => j.conclusion === 'failure'
    );
    if (!failed) continue;
    const step = (failed.steps ?? []).find(s => s.conclusion === 'failure');
    return `${failed.name}${step ? ` / ${step.name}` : ''} (${run.url})`;
  }
  return 'no failed controller run found (releases are being superseded or not started)';
}

function api(args) {
  const r = spawnSync(
    'node',
    ['packages/api-client/cli.ts', 'gh', '--priority', 'poll', '--', ...args],
    { encoding: 'utf8' }
  );
  if (r.status !== 0) throw new Error(r.stderr || 'gh failed');
  return JSON.parse(r.stdout);
}

async function main() {
  const maxLagHours = Number(
    process.env.MAX_LAG_HOURS ?? DEFAULT_MAX_LAG_HOURS
  );
  const info = /** @type {{ commitSha?: string }} */ (
    await (await fetch('https://jov.ie/api/health/build-info')).json()
  );
  const run = (...a) => spawnSync('git', a, { encoding: 'utf8' });
  const mainSha = run('rev-parse', 'HEAD').stdout.trim();
  let firstUnshippedMs;
  if (info.commitSha && info.commitSha !== mainSha) {
    run('fetch', '--depth=1', 'origin', info.commitSha);
    const prodMs =
      Number(run('show', '-s', '--format=%ct', info.commitSha).stdout.trim()) *
      1000;
    if (Number.isFinite(prodMs)) {
      run(
        'fetch',
        `--shallow-since=${new Date(prodMs - 60_000).toISOString()}`,
        'origin',
        'main'
      );
      const first = run(
        'log',
        '--reverse',
        '--format=%ct',
        `${info.commitSha}..FETCH_HEAD`
      )
        .stdout.trim()
        .split('\n')[0];
      if (first) firstUnshippedMs = Number(first) * 1000;
    }
  }
  const result = evaluateReleaseLag({
    prodSha: info.commitSha,
    mainSha,
    firstUnshippedMs,
    nowMs: Date.now(),
    maxLagHours,
  });
  console.log(
    `release-lag: ${result.ok ? 'ok' : 'LAGGING'} - ${result.reason}`
  );
  if (result.ok) return 0;
  let blocker = 'unknown (blocker lookup failed)';
  try {
    const runs = api([
      'run',
      'list',
      '--workflow',
      'production-controller.yml',
      '--limit',
      '10',
      '--json',
      'databaseId,conclusion,url',
    ]);
    blocker = findBlocker(
      runs,
      id => api(['run', 'view', String(id), '--json', 'jobs']).jobs
    );
  } catch {}
  console.log(
    `::error title=Release lag::${result.reason}. Blocking: ${blocker}`
  );
  return 1;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main().then(code => {
    process.exitCode = code;
  });
}
