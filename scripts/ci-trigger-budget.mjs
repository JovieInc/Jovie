#!/usr/bin/env node
// api-budget: github-actions-token 200/hr - one nightly run on CI Duration Ratchet's existing cron: 84 two-hour total_count reads, ~30 skipped-run reads for a 6-hour sample, ~40 per-workflow confirmations (measured 196 with four always-skipped workflows still live)
// api-budget: github-search 1/hr - one merged-PR count per nightly run
//
// CI fan-out budget (audit finding 4). Read-only. Counts the last 7 days of
// workflow runs per merged PR and fails when that passes the ceiling in
// scripts/ci-trigger-registry.json, or when a busy workflow skipped every job
// in more than 95% of its runs over both a 6-hour sample and the last 7 days.
// Uses the job's own GITHUB_TOKEN through the shared client at report
// priority (shed first under quota pressure). Never a PR check.
//   GITHUB_REPOSITORY=owner/repo node scripts/ci-trigger-budget.mjs
import { execFileSync } from 'node:child_process';
import { appendFileSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const SKIP_THRESHOLD = 0.95;
export const MIN_SKIPPED_IN_SAMPLE = 5; // 6 hours; about 20 a day
const SAMPLE = 6 * 3_600_000;
const COUNT_CAP = 2400; // a filtered runs query reports at most 2,500
const LIST_CAP = 1000; // and lists at most 1,000
const HOUR = 3_600_000;
const DAY = 24 * HOUR;

const iso = date => date.toISOString().replace(/\.\d{3}Z$/, 'Z');
const window = (from, to) => `created=${iso(from)}..${iso(to)}`;
const half = (from, to) =>
  new Date(from.getTime() + Math.floor((to - from) / 2));

/** Total runs, halving the window while the count sits at the API cap. */
export function countRuns(api, base, from, to, extra = '') {
  const n = api(`${base}?${window(from, to)}&per_page=1${extra}`).total_count;
  if (n < COUNT_CAP || to - from <= 30 * 60_000) return n;
  const mid = half(from, to);
  return (
    countRuns(api, base, from, mid, extra) +
    countRuns(api, base, new Date(mid.getTime() + 1000), to, extra)
  );
}

/** Skipped runs in the window grouped by workflow file. */
export function skippedByWorkflow(api, repo, from, to) {
  const base = `repos/${repo}/actions/runs`;
  const n = api(
    `${base}?${window(from, to)}&status=skipped&per_page=1`
  ).total_count;
  if (n > LIST_CAP && to - from > 30 * 60_000) {
    const mid = half(from, to);
    const a = skippedByWorkflow(api, repo, from, mid);
    const b = skippedByWorkflow(api, repo, new Date(mid.getTime() + 1000), to);
    for (const [file, count] of Object.entries(b))
      a[file] = (a[file] ?? 0) + count;
    return a;
  }
  const out = {};
  for (let page = 1; page <= Math.ceil(n / 100); page += 1)
    for (const run of api(
      `${base}?${window(from, to)}&status=skipped&per_page=100&page=${page}`
    ).workflow_runs ?? []) {
      const file = path.posix.basename(String(run.path ?? '').split('@')[0]);
      if (file) out[file] = (out[file] ?? 0) + 1;
    }
  return out;
}

/**
 * @param {{ runs: number, merged: number, budget: { runsPerMergedPr: number, ceiling: number },
 *   skipping: Array<{ file: string, day: number[], week: number[] }> }} input
 */
export function evaluateBudget({ runs, merged, budget, skipping }) {
  const runsPerMergedPr =
    merged > 0 ? Math.round((runs / merged) * 10) / 10 : null;
  const errors = [];
  if (runsPerMergedPr === null)
    errors.push('no merged PRs in the window; runs per merge is unknown');
  else if (runsPerMergedPr > budget.ceiling)
    errors.push(
      `${runsPerMergedPr} runs per merged PR passes the registry ceiling ${budget.ceiling} (target ${budget.runsPerMergedPr}); find the new fan-out in scripts/ci-trigger-registry.json`
    );
  /** @param {number[]} pair skipped, total */
  const over = ([skipped, total]) =>
    total > 0 && skipped / total > SKIP_THRESHOLD;
  for (const row of skipping)
    if (over(row.day) && over(row.week))
      errors.push(
        `${row.file}: ${row.week[0]} of ${row.week[1]} runs in 7 days skipped every job; move its job-level if: into the trigger`
      );
  return { runsPerMergedPr, errors };
}

export function summary({ runs, merged, budget, skipping, result }) {
  return [
    '## CI fan-out budget (last 7 days)',
    '',
    `${runs} workflow runs for ${merged} merged PRs: **${result.runsPerMergedPr ?? '?'} runs per merged PR** (ceiling ${budget.ceiling}, target ${budget.runsPerMergedPr}).`,
    '',
    '| busiest skipping workflow | skipped / runs, last 6 hours | skipped / runs, 7 days |',
    '|---|---|---|',
    ...skipping.map(
      row =>
        `| ${row.file} | ${row.day.join(' / ')} | ${row.week.join(' / ')} |`
    ),
    '',
    ...(result.errors.length
      ? ['**Over budget:**', ...result.errors.map(e => `- ${e}`)]
      : ['Within budget.']),
    '',
  ].join('\n');
}

export function measure({ api, repo, now = Date.now() }) {
  const to = new Date(Math.floor(now / HOUR) * HOUR);
  const week = new Date(to.getTime() - 7 * DAY);
  const sample = new Date(to.getTime() - SAMPLE);
  // Repository-wide, ~110k runs a week: fixed 2-hour slices stay under the cap
  // (about 1,500 each) instead of halving from the full week, which wastes reads.
  let runs = 0;
  for (let t = week.getTime(); t < to.getTime(); t += 2 * HOUR)
    runs += countRuns(
      api,
      `repos/${repo}/actions/runs`,
      new Date(t),
      new Date(
        t + 2 * HOUR >= to.getTime() ? to.getTime() : t + 2 * HOUR - 1000
      )
    );
  const merged = api(
    `search/issues?q=${encodeURIComponent(`repo:${repo} is:pr is:merged merged:${iso(week)}..${iso(to)}`)}&per_page=1`
  ).total_count;
  const skipping = [];
  const recent = skippedByWorkflow(api, repo, sample, to);
  for (const [file, skipped] of Object.entries(recent).sort(
    (a, b) => b[1] - a[1]
  )) {
    if (skipped < MIN_SKIPPED_IN_SAMPLE) break;
    const base = `repos/${repo}/actions/workflows/${file}/runs`;
    const row = {
      file,
      day: [skipped, countRuns(api, base, sample, to)],
      week: [0, 0],
    };
    if (row.day[1] > 0 && row.day[0] / row.day[1] > SKIP_THRESHOLD)
      row.week = [
        countRuns(api, base, week, to, '&status=skipped'),
        countRuns(api, base, week, to),
      ];
    skipping.push(row);
  }
  return { runs, merged, skipping };
}

const API_CLIENT_CLI = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../packages/api-client/cli.ts'
);
const clientApi = endpoint =>
  JSON.parse(
    execFileSync(
      process.execPath,
      [API_CLIENT_CLI, 'gh', '--priority', 'report', '--', 'api', endpoint],
      {
        encoding: 'utf8',
        maxBuffer: 64 * 1024 * 1024,
      }
    )
  );

export function main(env = process.env, api = clientApi) {
  const repo = env.GITHUB_REPOSITORY;
  if (!repo) throw new Error('GITHUB_REPOSITORY is required');
  // Plain JSON read: the nightly job installs no dependencies.
  const registryPath = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    'ci-trigger-registry.json'
  );
  const { budget } = JSON.parse(readFileSync(registryPath, 'utf8'));
  let measured;
  try {
    measured = measure({ api, repo });
  } catch (error) {
    // Exit 75 is the shared client shedding report-priority reads under quota
    // pressure: infrastructure, not a budget verdict (tomorrow's run measures).
    if (/** @type {{ status?: number }} */ (error).status !== 75) throw error;
    process.stdout.write(
      '::notice title=CI fan-out budget::deferred: GitHub quota is reserved for merge work; not measured tonight\n'
    );
    return 0;
  }
  const result = evaluateBudget({ ...measured, budget });
  const text = summary({ ...measured, budget, result });
  process.stdout.write(text);
  if (env.GITHUB_STEP_SUMMARY) appendFileSync(env.GITHUB_STEP_SUMMARY, text);
  for (const error of result.errors)
    process.stdout.write(`::error title=CI fan-out budget::${error}\n`);
  return result.errors.length ? 1 : 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  process.exitCode = main();
