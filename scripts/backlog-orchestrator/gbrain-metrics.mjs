/**
 * GBrain retrieval telemetry and service-contract summary (JOV-7099).
 *
 * The gbrain client emits one record per lookup attempt (get/search) through a
 * fail-soft `observe` hook. Records append to a JSONL ledger outside the git
 * tree (`resolveTelemetryFile`); `summarizeGbrainRetrieval` projects them into
 * the service contract the founder directive requires: success/clean-miss/
 * error/timeout rates, p50/p95/p99 latency, keyword-vs-semantic path split,
 * and cache hit rate when callers record cache outcomes.
 *
 * Unknowns stay explicit: metrics only describe observed records. A workload
 * with zero records reports `lookups: 0`, not a fabricated health score.
 */

import { appendFileSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  assertsOutsideGitTree,
  defaultRuntimeDir,
  ensureParentDir,
} from './runtime-state.mjs';

const MODULE_DIR = fileURLToPath(new URL('.', import.meta.url));

export const GBRAIN_TELEMETRY_SCHEMA = 'gbrain-retrieval/v1';
export const GBRAIN_TELEMETRY_BASENAME = 'gbrain-retrieval.jsonl';
export const GBRAIN_TELEMETRY_DISABLE_VALUE = 'off';

export const GBRAIN_LOOKUP_OUTCOME = Object.freeze({
  HIT: 'hit',
  CLEAN_MISS: 'clean_miss',
  ERROR: 'error',
  TIMEOUT: 'timeout',
});

const OUTCOMES = new Set(Object.values(GBRAIN_LOOKUP_OUTCOME));

export function isTimeoutError(error) {
  const errors =
    error instanceof AggregateError && Array.isArray(error.errors)
      ? error.errors
      : [error];
  return errors.some(
    candidate =>
      candidate?.code === 'ETIMEDOUT' ||
      candidate?.killed === true ||
      candidate?.signal === 'SIGTERM' ||
      candidate?.message === 'gbrain-context-lookup-deadline-exceeded'
  );
}

function errorCode(error) {
  const errors =
    error instanceof AggregateError && Array.isArray(error.errors)
      ? error.errors
      : [error];
  return String(
    errors.find(candidate => candidate?.code)?.code || error?.name || 'Error'
  );
}

export function resolveTelemetryFile({
  env = process.env,
  orchestratorDir,
} = {}) {
  const override = String(env.JOVIE_GBRAIN_TELEMETRY || '').trim();
  if (override === GBRAIN_TELEMETRY_DISABLE_VALUE) return null;
  const file =
    override || join(defaultRuntimeDir(env), GBRAIN_TELEMETRY_BASENAME);
  if (orchestratorDir) assertsOutsideGitTree(file, orchestratorDir);
  return file;
}

/** Build a normalized telemetry record; returns null when the input is unusable. */
export function buildLookupRecord(input, { now = Date.now } = {}) {
  if (!input || typeof input !== 'object') return null;
  const operation = input.operation === 'get' ? 'get' : 'search';
  const outcome = OUTCOMES.has(input.outcome) ? input.outcome : null;
  if (!outcome) return null;
  const ms = Number(input.ms);
  if (!Number.isFinite(ms) || ms < 0) return null;
  const resultCount = Number(input.resultCount);
  return {
    schema: GBRAIN_TELEMETRY_SCHEMA,
    ts: new Date(now()).toISOString(),
    operation,
    outcome,
    source:
      typeof input.source === 'string' && input.source.trim()
        ? input.source.trim()
        : null,
    ms: Math.round(ms),
    resultCount:
      Number.isFinite(resultCount) && resultCount >= 0
        ? Math.floor(resultCount)
        : null,
    target:
      typeof input.target === 'string' && input.target.trim()
        ? input.target.trim()
        : null,
    revisions: Array.isArray(input.revisions)
      ? input.revisions
          .filter(revision => typeof revision === 'string' && revision.trim())
          .map(revision => revision.trim())
      : [],
    cacheHit: typeof input.cacheHit === 'boolean' ? input.cacheHit : null,
    error:
      outcome === GBRAIN_LOOKUP_OUTCOME.ERROR ||
      outcome === GBRAIN_LOOKUP_OUTCOME.TIMEOUT
        ? errorCode(input.error)
        : null,
  };
}

/**
 * Fail-soft observer factory for `createGbrainClient({ observe })`. Appends a
 * JSONL record per lookup; never throws into the retrieval path.
 */
export function createTelemetryObserver({
  env = process.env,
  orchestratorDir = MODULE_DIR,
  now = Date.now,
  write = appendFileSync,
} = {}) {
  let file;
  try {
    file = resolveTelemetryFile({ env, orchestratorDir });
  } catch {
    file = null;
  }
  if (!file) return () => {};
  const target = ensureParentDir(file);
  return record => {
    try {
      const normalized = buildLookupRecord(record, { now });
      if (normalized) write(target, `${JSON.stringify(normalized)}\n`, 'utf8');
    } catch {
      // Telemetry must never break or slow a retrieval; drop the record.
    }
  };
}

export function loadTelemetryRecords(file, { maxLines = 10_000 } = {}) {
  let raw;
  try {
    raw = readFileSync(file, 'utf8');
  } catch (error) {
    if (error?.code === 'ENOENT') return [];
    throw error;
  }
  return raw
    .split('\n')
    .filter(line => line.trim())
    .slice(-Math.max(1, Math.floor(maxLines)))
    .map(line => {
      try {
        return JSON.parse(line);
      } catch {
        return null;
      }
    })
    .filter(record => record?.schema === GBRAIN_TELEMETRY_SCHEMA);
}

function percentile(sortedValues, p) {
  if (sortedValues.length === 0) return null;
  const index = Math.min(
    sortedValues.length - 1,
    Math.ceil((p / 100) * sortedValues.length) - 1
  );
  return sortedValues[Math.max(0, index)];
}

function latencySummary(records) {
  const values = records
    .map(record => record.ms)
    .filter(ms => Number.isFinite(ms) && ms >= 0)
    .sort((a, b) => a - b);
  return {
    p50: percentile(values, 50),
    p95: percentile(values, 95),
    p99: percentile(values, 99),
    max: values.length ? values[values.length - 1] : null,
  };
}

function rate(part, whole) {
  if (!whole) return null;
  return Math.round((part / whole) * 10_000) / 10_000;
}

function summarizeBucket(records) {
  const hits = records.filter(
    record => record.outcome === GBRAIN_LOOKUP_OUTCOME.HIT
  ).length;
  const cleanMisses = records.filter(
    record => record.outcome === GBRAIN_LOOKUP_OUTCOME.CLEAN_MISS
  ).length;
  const timeouts = records.filter(
    record => record.outcome === GBRAIN_LOOKUP_OUTCOME.TIMEOUT
  ).length;
  const errors = records.filter(
    record => record.outcome === GBRAIN_LOOKUP_OUTCOME.ERROR
  ).length;
  return {
    lookups: records.length,
    hits,
    cleanMisses,
    errors,
    timeouts,
    successRate: rate(hits + cleanMisses, records.length),
    cleanMissRate: rate(cleanMisses, records.length),
    errorRate: rate(errors + timeouts, records.length),
    latencyMs: latencySummary(records),
  };
}

/**
 * Project telemetry records into the JOV-7099 service contract. `null` rates
 * mean "no observations" — callers must surface that as unknown, not zero.
 */
export function summarizeGbrainRetrieval(records, { now = Date.now } = {}) {
  const list = Array.isArray(records) ? records : [];
  const timestamps = list
    .map(record => Date.parse(record?.ts || ''))
    .filter(Number.isFinite)
    .sort((a, b) => a - b);

  const bySource = {};
  for (const record of list) {
    const source = record?.source || 'unknown';
    (bySource[source] ||= []).push(record);
  }

  const cacheable = list.filter(
    record => record?.cacheHit === true || record?.cacheHit === false
  );
  const cacheHits = cacheable.filter(record => record.cacheHit === true).length;

  return {
    schema: 'gbrain-retrieval-contract/v1',
    generatedAt: new Date(now()).toISOString(),
    window: {
      lookups: list.length,
      oldestTs: timestamps.length
        ? new Date(timestamps[0]).toISOString()
        : null,
      newestTs: timestamps.length
        ? new Date(timestamps[timestamps.length - 1]).toISOString()
        : null,
    },
    ...summarizeBucket(list),
    bySource: Object.fromEntries(
      Object.keys(bySource)
        .sort()
        .map(source => [source, summarizeBucket(bySource[source])])
    ),
    cache: {
      observed: cacheable.length,
      hits: cacheHits,
      hitRate: cacheable.length ? rate(cacheHits, cacheable.length) : null,
    },
    revisionsObserved: new Set(
      list.flatMap(record =>
        Array.isArray(record?.revisions) ? record.revisions : []
      )
    ).size,
  };
}

export function renderContractReport(file, options = {}) {
  return summarizeGbrainRetrieval(loadTelemetryRecords(file, options), options);
}

const isCli =
  process.argv[1] &&
  fileURLToPath(import.meta.url) === resolve(process.argv[1]);

if (isCli) {
  const fileArg = process.argv.find(arg => arg.startsWith('--file='));
  const file = fileArg
    ? fileArg.slice('--file='.length)
    : resolveTelemetryFile({});
  if (!file) {
    console.log(
      JSON.stringify({
        error: 'telemetry disabled (JOVIE_GBRAIN_TELEMETRY=off)',
      })
    );
    process.exit(0);
  }
  console.log(JSON.stringify(renderContractReport(file), null, 2));
}
