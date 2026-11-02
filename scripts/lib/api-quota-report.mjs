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
    // A GitHub token's rate-limit window ends at its own x-ratelimit-reset (the
    // installation's windows run :23 to :23, not on the hour), so key on that.
    // Samples without a reset fall back to the hour they were taken in.
    const windowStart = Number.isFinite(sample.reset)
      ? sample.reset - windowSeconds
      : Math.floor(sample.at / windowSeconds) * windowSeconds;
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
  // Each bucket's window ends at the x-ratelimit-reset its newest sample reports
  // (not on the hour: the installation's windows run :23 to :23). Samples without
  // a reset fall back to the hour boundary.
  const byBucket = new Map();
  for (const sample of samples) {
    if (!sample || sample.at > nowSeconds) continue;
    const list = byBucket.get(sample.bucket) ?? [];
    list.push(sample);
    byBucket.set(sample.bucket, list);
  }
  const alerts = [];
  for (const [bucket, all] of byBucket) {
    all.sort((a, b) => a.at - b.at);
    const newest = all[all.length - 1];
    const hourStart = Math.floor(nowSeconds / windowSeconds) * windowSeconds;
    const resetAt = Number.isFinite(newest.reset)
      ? newest.reset
      : hourStart + windowSeconds;
    if (resetAt <= nowSeconds) continue;
    const windowStart = resetAt - windowSeconds;
    const list = all.filter(sample =>
      Number.isFinite(newest.reset)
        ? sample.reset === newest.reset
        : sample.at >= windowStart
    );
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

/** Seconds a job ran, or null when it never started or finished. */
export function jobSeconds(job) {
  const started = Date.parse(job?.started_at);
  const completed = Date.parse(job?.completed_at);
  if (!Number.isFinite(started) || !Number.isFinite(completed)) return null;
  return Math.max(0, (completed - started) / 1000);
}

function ghJson(path, attempts = 3) {
  for (let attempt = 1; ; attempt += 1) {
    try {
      return JSON.parse(
        execFileSync('gh', ['api', path], {
          encoding: 'utf8',
          maxBuffer: 32 * 1024 * 1024,
          stdio: ['ignore', 'pipe', 'pipe'],
        })
      );
    } catch (error) {
      // A transient GitHub 5xx must not crash a report that runs from the doctor.
      if (attempt >= attempts) throw error;
      Atomics.wait(
        new Int32Array(new SharedArrayBuffer(4)),
        0,
        0,
        attempt * 1500
      );
    }
  }
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
  else {
    console.error(
      'usage: api-quota-report.mjs quota|headroom|drain|admission [--hours N] [--runs N]'
    );
    process.exit(2);
  }
}
