#!/usr/bin/env node
// JOV-8754: measure the two REST buckets the merge queue depends on, and the
// admission stall they cause.
//
//   node scripts/lib/api-quota-report.mjs quota --hours 3
//     reads the `api-quota` notices Merge Queue Green Enroll's enroll job emits
//     (bucket=github-token|jovie-bot) and prints per-10-minute minimum
//     remaining per bucket, plus exhausted samples.
//   node scripts/lib/api-quota-report.mjs headroom --hours 1 [--json]
//     hourly headroom per bucket: min/median remaining, exhausted samples and
//     the share of samples that were empty (the number Ovie shows).
//   node scripts/lib/api-quota-report.mjs admission --runs 40
//     prints Merge Group Admission job duration p50/p95/max over recent
//     merge_group CI runs (a quota stall shows up as minutes, not seconds).
//
// Read-only. Sampling is bounded (--max-samples) to stay cheap on the caller's
// own token.

import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

const REPOSITORY = process.env.GITHUB_REPOSITORY || 'JovieInc/Jovie';
const NOTICE =
  /bucket=(github-token|jovie-bot) remaining=(\d+) limit=(\d+) used=(\d+) reset=(\d+) at=(\d+)/;

/** @param {string} message */
export function parseQuotaNotice(message) {
  const match = NOTICE.exec(String(message ?? ''));
  if (!match) return null;
  return {
    bucket: match[1],
    remaining: Number(match[2]),
    limit: Number(match[3]),
    used: Number(match[4]),
    reset: Number(match[5]),
    at: Number(match[6]),
  };
}

/** Nearest-rank percentile; null for an empty series. */
export function percentile(values, p) {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (sorted.length === 0) return null;
  const rank = Math.min(
    sorted.length - 1,
    Math.ceil((p / 100) * sorted.length) - 1
  );
  return sorted[Math.max(0, rank)];
}

/**
 * Per-bucket, per-window minimum remaining.
 * @param {Array<ReturnType<typeof parseQuotaNotice>>} samples
 * @param {number} windowSeconds
 */
export function summarizeQuota(samples, windowSeconds = 600) {
  /** @type {Map<string, { bucket: string, windowStart: number, minRemaining: number, samples: number, exhausted: number }>} */
  const rows = new Map();
  for (const sample of samples) {
    if (!sample) continue;
    const windowStart = Math.floor(sample.at / windowSeconds) * windowSeconds;
    const key = `${sample.bucket}@${windowStart}`;
    const row = rows.get(key) ?? {
      bucket: sample.bucket,
      windowStart,
      minRemaining: Number.POSITIVE_INFINITY,
      samples: 0,
      exhausted: 0,
    };
    row.minRemaining = Math.min(row.minRemaining, sample.remaining);
    row.samples += 1;
    if (sample.remaining === 0) row.exhausted += 1;
    rows.set(key, row);
  }
  return [...rows.values()].sort(
    (a, b) => a.windowStart - b.windowStart || a.bucket.localeCompare(b.bucket)
  );
}

/**
 * Hourly headroom per bucket from `api-quota` samples.
 * `emptyShare` is the fraction of samples taken with zero calls left: the
 * share of the hour merge-queue and evidence reads would have been deferred.
 * @param {Array<ReturnType<typeof parseQuotaNotice>>} samples
 * @param {number} windowSeconds
 */
export function summarizeHeadroom(samples, windowSeconds = 3600) {
  const rows = new Map();
  for (const sample of samples) {
    if (!sample) continue;
    const windowStart = Math.floor(sample.at / windowSeconds) * windowSeconds;
    const key = `${sample.bucket}@${windowStart}`;
    const row = rows.get(key) ?? {
      bucket: sample.bucket,
      windowStart,
      limit: sample.limit,
      values: [],
    };
    row.values.push(sample.remaining);
    rows.set(key, row);
  }
  return [...rows.values()]
    .map(row => ({
      bucket: row.bucket,
      windowStart: new Date(row.windowStart * 1000).toISOString(),
      limit: row.limit,
      samples: row.values.length,
      minRemaining: Math.min(...row.values),
      medianRemaining: percentile(row.values, 50),
      exhaustedSamples: row.values.filter(value => value === 0).length,
      emptyShare:
        Math.round(
          (row.values.filter(value => value === 0).length / row.values.length) *
            1000
        ) / 1000,
    }))
    .sort(
      (a, b) =>
        a.windowStart.localeCompare(b.windowStart) ||
        a.bucket.localeCompare(b.bucket)
    );
}

/**
 * Buckets projected to run dry before their hourly window resets, from this
 * window's samples: consumption rate = remaining drop over elapsed time, so
 * time-to-empty = remaining / rate. Needs `minSamples` readings spanning at least
 * `minSpanSeconds`; a flat or refilling bucket never alerts.
 *
 * @param {{ at: number, bucket: string, remaining: number, limit?: number }[]} samples
 * @param {number} nowSeconds
 * @param {{ windowSeconds?: number, minSamples?: number, minSpanSeconds?: number }} [options]
 */
export function projectDrain(samples, nowSeconds, options = {}) {
  const {
    windowSeconds = 3600,
    minSamples = 3,
    minSpanSeconds = 120,
  } = options;
  const windowStart = Math.floor(nowSeconds / windowSeconds) * windowSeconds;
  const resetAt = windowStart + windowSeconds;
  const byBucket = new Map();
  for (const sample of samples) {
    if (!sample || sample.at < windowStart || sample.at > nowSeconds) continue;
    const list = byBucket.get(sample.bucket) ?? [];
    list.push(sample);
    byBucket.set(sample.bucket, list);
  }
  const alerts = [];
  for (const [bucket, list] of byBucket) {
    list.sort((a, b) => a.at - b.at);
    const first = list[0];
    const last = list[list.length - 1];
    const span = last.at - first.at;
    if (list.length < minSamples || span < minSpanSeconds) continue;
    const rate = (first.remaining - last.remaining) / span;
    if (!(rate > 0)) continue;
    const emptyAt = last.at + last.remaining / rate;
    if (emptyAt >= resetAt) continue;
    alerts.push({
      bucket,
      remaining: last.remaining,
      ratePerMinute: Math.round(rate * 60),
      emptyAt: new Date(emptyAt * 1000).toISOString(),
      resetAt: new Date(resetAt * 1000).toISOString(),
      minutesEarly: Math.round((resetAt - emptyAt) / 60),
    });
  }
  return alerts.sort((a, b) => a.bucket.localeCompare(b.bucket));
}

const TALLY_NOTICE =
  /workflow=(.+?) job=(\S+) calls=(\d+) github_token=(\d+) other=(\d+) top=(.*)$/;

/** @param {string} message */
export function parseTallyNotice(message) {
  const match = TALLY_NOTICE.exec(String(message ?? ''));
  if (!match) return null;
  return {
    workflow: match[1],
    job: match[2],
    calls: Number(match[3]),
    githubToken: Number(match[4]),
    other: Number(match[5]),
    top: match[6],
  };
}

/**
 * gh invocations per workflow and job from `gh-tally` job notices: runs, calls and
 * github.token calls, and each job's mean github.token calls per run. `hours` turns
 * the totals into per-hour rates.
 *
 * @param {Array<ReturnType<typeof parseTallyNotice>>} records
 * @param {number} hours
 */
export function summarizeTally(records, hours = 1) {
  const rows = new Map();
  for (const record of records) {
    if (!record) continue;
    const key = `${record.workflow} / ${record.job}`;
    const row = rows.get(key) ?? {
      key,
      runs: 0,
      calls: 0,
      githubToken: 0,
      other: 0,
    };
    row.runs += 1;
    row.calls += record.calls;
    row.githubToken += record.githubToken;
    row.other += record.other;
    rows.set(key, row);
  }
  return [...rows.values()]
    .map(row => ({
      ...row,
      githubTokenPerRun: Math.round((row.githubToken / row.runs) * 10) / 10,
      githubTokenPerHour: Math.round(row.githubToken / hours),
    }))
    .sort(
      (a, b) => b.githubToken - a.githubToken || a.key.localeCompare(b.key)
    );
}

/** Seconds a job ran, or null when it never started or finished. */
export function jobSeconds(job) {
  const started = Date.parse(job?.started_at);
  const completed = Date.parse(job?.completed_at);
  if (!Number.isFinite(started) || !Number.isFinite(completed)) return null;
  return Math.max(0, (completed - started) / 1000);
}

function ghJson(path) {
  return JSON.parse(
    execFileSync('gh', ['api', path], {
      encoding: 'utf8',
      maxBuffer: 32 * 1024 * 1024,
    })
  );
}

function flag(argv, name, fallback) {
  const index = argv.indexOf(`--${name}`);
  return index >= 0 ? Number(argv[index + 1]) : fallback;
}

function collectSamples(argv) {
  const hours = flag(argv, 'hours', 3);
  const maxSamples = flag(argv, 'max-samples', 60);
  const since = new Date(Date.now() - hours * 3600_000).toISOString();
  const runs = ghJson(
    `repos/${REPOSITORY}/actions/workflows/merge-queue-green-enroll.yml/runs?created=>=${since}&status=success&per_page=100`
  ).workflow_runs;
  const stride = Math.max(1, Math.ceil(runs.length / maxSamples));
  const samples = [];
  for (let index = 0; index < runs.length; index += stride) {
    const jobs = ghJson(
      `repos/${REPOSITORY}/actions/runs/${runs[index].id}/jobs?per_page=50`
    ).jobs;
    const enroll = jobs.find(job => job.name === 'Enqueue green PRs');
    if (!enroll || enroll.conclusion !== 'success') continue;
    const annotations = ghJson(
      `repos/${REPOSITORY}/check-runs/${enroll.id}/annotations?per_page=50`
    );
    for (const annotation of annotations) {
      if (annotation.title === 'api-quota')
        samples.push(parseQuotaNotice(annotation.message));
    }
  }
  return samples;
}

function headroom(argv) {
  const rows = summarizeHeadroom(collectSamples(argv));
  if (argv.includes('--json')) {
    console.log(
      JSON.stringify({
        schema: 'jovie-actions-quota-headroom/v1',
        generatedAt: new Date().toISOString(),
        windows: rows,
      })
    );
    return;
  }
  for (const row of rows)
    console.log(
      `${row.windowStart.slice(0, 16)}Z ${row.bucket.padEnd(12)} min=${row.minRemaining} median=${row.medianRemaining} limit=${row.limit} empty=${(row.emptyShare * 100).toFixed(1)}% samples=${row.samples}`
    );
  if (rows.length === 0) console.log('no api-quota samples in window');
}

function quota(argv) {
  const rows = summarizeQuota(collectSamples(argv));
  for (const row of rows) {
    console.log(
      `${new Date(row.windowStart * 1000).toISOString().slice(11, 16)}Z ${row.bucket.padEnd(12)} min_remaining=${row.minRemaining} samples=${row.samples} exhausted=${row.exhausted}`
    );
  }
  if (rows.length === 0) console.log('no api-quota samples in window');
}

function drain(argv) {
  const samples = collectSamples(argv);
  const now = Math.floor(Date.now() / 1000);
  const alerts = projectDrain(samples, now);
  if (argv.includes('--json'))
    console.log(
      JSON.stringify({
        schema: 'jovie-actions-quota-drain/v1',
        generatedAt: new Date(now * 1000).toISOString(),
        alerts,
      })
    );
  for (const alert of alerts)
    console.log(
      `::warning title=GitHub ${alert.bucket} bucket projected to drain::${alert.bucket} has ${alert.remaining} left at ~${alert.ratePerMinute}/min; empty at ${alert.emptyAt}, ${alert.minutesEarly} min before the ${alert.resetAt} reset.`
    );
  if (alerts.length) process.exitCode = 3;
}

const TALLY_WORKFLOWS = ['lane-fix-relay.yml', 'fleet-rules-evidence.yml'];

function collectTally(argv) {
  const hours = flag(argv, 'hours', 1);
  const maxRuns = flag(argv, 'max-runs', 60);
  const since = new Date(Date.now() - hours * 3600_000).toISOString();
  const records = [];
  for (const workflow of TALLY_WORKFLOWS) {
    const runs = ghJson(
      `repos/${REPOSITORY}/actions/workflows/${workflow}/runs?created=>=${since}&per_page=100`
    )
      .workflow_runs.filter(
        run => run.conclusion && run.conclusion !== 'skipped'
      )
      .slice(0, maxRuns);
    for (const run of runs) {
      const jobs = ghJson(
        `repos/${REPOSITORY}/actions/runs/${run.id}/jobs?per_page=50`
      ).jobs;
      for (const job of jobs) {
        if (job.conclusion === 'skipped') continue;
        for (const annotation of ghJson(
          `repos/${REPOSITORY}/check-runs/${job.id}/annotations?per_page=50`
        ))
          if (annotation.title === 'gh-tally')
            records.push(parseTallyNotice(annotation.message));
      }
    }
  }
  return { hours, records };
}

function tally(argv) {
  const { hours, records } = collectTally(argv);
  const rows = summarizeTally(records, hours);
  if (argv.includes('--json')) {
    console.log(
      JSON.stringify({
        schema: 'jovie-gh-call-tally/v1',
        generatedAt: new Date().toISOString(),
        hours,
        rows,
      })
    );
    return;
  }
  for (const row of rows)
    console.log(
      `${row.key.padEnd(52)} runs=${row.runs} calls=${row.calls} github.token=${row.githubToken} (${row.githubTokenPerRun}/run, ${row.githubTokenPerHour}/h) other=${row.other}`
    );
  if (rows.length === 0) console.log('no gh-tally notices in window');
}

function admission(argv) {
  const count = flag(argv, 'runs', 40);
  const runs = ghJson(
    `repos/${REPOSITORY}/actions/workflows/ci.yml/runs?event=merge_group&status=completed&per_page=${Math.min(100, count)}`
  ).workflow_runs.slice(0, count);
  const seconds = [];
  for (const run of runs) {
    const jobs = ghJson(
      `repos/${REPOSITORY}/actions/runs/${run.id}/jobs?per_page=100`
    ).jobs;
    const job = jobs.find(item => item.name === 'Merge Group Admission');
    const value = jobSeconds(job);
    if (value !== null) seconds.push(value);
  }
  console.log(
    `admission n=${seconds.length} p50=${percentile(seconds, 50)}s p95=${percentile(seconds, 95)}s max=${seconds.length ? Math.max(...seconds) : null}s stalls>120s=${seconds.filter(value => value > 120).length}`
  );
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const [command, ...rest] = process.argv.slice(2);
  if (command === 'quota') quota(rest);
  else if (command === 'headroom') headroom(rest);
  else if (command === 'admission') admission(rest);
  else if (command === 'drain') drain(rest);
  else if (command === 'tally') tally(rest);
  else {
    console.error(
      'usage: api-quota-report.mjs quota|headroom|drain|tally|admission [--hours N] [--runs N]'
    );
    process.exit(2);
  }
}
