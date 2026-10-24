#!/usr/bin/env node
// JOV-8754: measure the two REST buckets the merge queue depends on, and the
// admission stall they cause.
//
//   node scripts/lib/api-quota-report.mjs quota --hours 3
//     reads the `api-quota` notices Merge Queue Green Enroll's enroll job emits
//     (bucket=github-token|jovie-bot) and prints per-10-minute minimum
//     remaining per bucket, plus exhausted samples.
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

function quota(argv) {
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
  const rows = summarizeQuota(samples);
  for (const row of rows) {
    console.log(
      `${new Date(row.windowStart * 1000).toISOString().slice(11, 16)}Z ${row.bucket.padEnd(12)} min_remaining=${row.minRemaining} samples=${row.samples} exhausted=${row.exhausted}`
    );
  }
  if (rows.length === 0) console.log('no api-quota samples in window');
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
  else if (command === 'admission') admission(rest);
  else {
    console.error(
      'usage: api-quota-report.mjs quota|admission [--hours N] [--runs N]'
    );
    process.exit(2);
  }
}
