#!/usr/bin/env node
/**
 * GBrain health digest builder (spike starter job).
 *
 * Collects bounded local probes into a structured digest that compounding
 * can turn into durable claims. Inject `exec` / `fetchImpl` in tests.
 *
 * Prior art: symphony-control `gbrain-health-summary.ts` (Telegram +
 * `ops/gbrain-health/latest`). This module owns the digest shape Jovie
 * compounds; it does not notify chat channels.
 */
import { execFileSync } from 'node:child_process';

export const DIGEST_SCHEMA = 'jovie.gbrain-health-digest/v1';
export const LATEST_SLUG = 'ops/gbrain-health/latest';
export const CLAIMS_INDEX_SLUG = 'ops/gbrain-health/claims/index';

const SOURCE_FRESHNESS_HOURS = 48;
const CODE_SOURCE_FRESHNESS_HOURS = 24;

/**
 * @typedef {'healthy' | 'degraded' | 'down'} HealthStatus
 * @typedef {{
 *   name: string,
 *   ok: boolean,
 *   detail: string,
 *   durationMs: number,
 *   required?: boolean,
 * }} HealthCheck
 * @typedef {{
 *   schema: typeof DIGEST_SCHEMA,
 *   status: HealthStatus,
 *   generatedAt: string,
 *   checks: HealthCheck[],
 *   recommendation: string,
 * }} HealthDigest
 */

/**
 * @param {string} output
 * @param {number} [maxChars]
 */
export function summarizeOutput(output, maxChars = 700) {
  const cleaned = String(output || '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!cleaned) return 'empty output';
  return cleaned.length > maxChars
    ? `${cleaned.slice(0, maxChars)}...`
    : cleaned;
}

/**
 * @param {string} output
 */
export function statusFromHealthEndpoint(output) {
  const text = String(output || '').trim();
  if (!text)
    return { ok: false, detail: 'health endpoint returned empty output' };
  try {
    const parsed = JSON.parse(text);
    const status = parsed.status;
    const ok = status === 'ok' || status === 'healthy';
    return {
      ok,
      detail:
        typeof status === 'string' ? `status=${status}` : summarizeOutput(text),
    };
  } catch {
    return {
      ok: false,
      detail: `invalid health JSON: ${summarizeOutput(text)}`,
    };
  }
}

/**
 * @param {string} output
 */
export function statusFromDoctor(output) {
  const text = String(output || '').trim();
  if (!text) return { ok: false, detail: 'doctor returned empty output' };
  try {
    const parsed = JSON.parse(text);
    const status = parsed.status;
    const healthScore = parsed.health_score ?? parsed.healthScore;
    const ok =
      status === 'ok' ||
      status === 'healthy' ||
      (typeof healthScore === 'number' && healthScore >= 0.8);
    if (typeof status !== 'string')
      return { ok, detail: summarizeOutput(text) };
    const score =
      typeof healthScore === 'number' ? ` health_score=${healthScore}` : '';
    return { ok, detail: `status=${status}${score}` };
  } catch {
    const lower = text.toLowerCase();
    const negative =
      /\b(unhealthy|not\s+ok|not\s+healthy|down|degraded|fail(ed|ing)?)\b/.test(
        lower
      );
    return {
      ok: !negative && (lower.includes('healthy') || lower.includes('ok')),
      detail: summarizeOutput(text),
    };
  }
}

/**
 * @param {string} output
 * @param {Date} now
 */
export function sourceFreshnessFromOutput(output, now) {
  try {
    const parsed = JSON.parse(output);
    if (!Array.isArray(parsed.sources) || parsed.sources.length === 0) {
      return { ok: false, detail: 'sources list contained no sources' };
    }
    /** @type {string[]} */
    const stale = [];
    for (const raw of parsed.sources) {
      if (!raw || typeof raw !== 'object') {
        stale.push('invalid source record');
        continue;
      }
      if (typeof raw.page_count !== 'number' || raw.page_count === 0) continue;
      const id =
        typeof raw.id === 'string'
          ? raw.id
          : typeof raw.name === 'string'
            ? raw.name
            : 'unknown';
      const syncedAt =
        typeof raw.last_sync_at === 'string'
          ? new Date(raw.last_sync_at)
          : null;
      if (!syncedAt || Number.isNaN(syncedAt.getTime())) {
        stale.push(`${id}: missing last_sync_at`);
        continue;
      }
      const ageHours = (now.getTime() - syncedAt.getTime()) / 3_600_000;
      const maxAgeHours = /code/i.test(id)
        ? CODE_SOURCE_FRESHNESS_HOURS
        : SOURCE_FRESHNESS_HOURS;
      if (ageHours > maxAgeHours) {
        stale.push(`${id}: ${Math.floor(ageHours)}h old (max ${maxAgeHours}h)`);
      }
    }
    return stale.length === 0
      ? { ok: true, detail: 'all indexed sources are fresh' }
      : { ok: false, detail: `stale sources: ${stale.join(', ')}` };
  } catch {
    return { ok: false, detail: 'sources list returned invalid JSON' };
  }
}

/**
 * @param {string} output
 */
export function serverProcessStatus(output) {
  const processes = String(output || '')
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean);
  return processes.length === 1
    ? { ok: true, detail: 'exactly one gbrain serve process is running' }
    : {
        ok: false,
        detail: `expected exactly one gbrain serve process, found ${processes.length}`,
      };
}

/**
 * @param {string} name
 * @param {() => { ok: boolean, detail: string }} run
 * @param {boolean} [required]
 * @returns {HealthCheck}
 */
export function timedCheck(name, run, required = true) {
  const started = Date.now();
  try {
    const result = run();
    return {
      name,
      ok: result.ok,
      detail: result.detail,
      durationMs: Date.now() - started,
      required,
    };
  } catch (err) {
    return {
      name,
      ok: false,
      detail: err instanceof Error ? err.message : String(err),
      durationMs: Date.now() - started,
      required,
    };
  }
}

/**
 * @param {{ generatedAt: string, checks: HealthCheck[] }} args
 * @returns {HealthDigest}
 */
export function buildHealthDigest(args) {
  const requiredChecks = args.checks.filter(check => check.required !== false);
  const failed = requiredChecks.filter(check => !check.ok);
  /** @type {HealthStatus} */
  const status =
    requiredChecks.length === 0 || failed.length === requiredChecks.length
      ? 'down'
      : failed.length === 0
        ? 'healthy'
        : 'degraded';
  const recommendation =
    status === 'healthy'
      ? 'No operator action needed.'
      : 'Check gbrain doctor output, gbrain serve status, and recent Hermes/OpenClaw logs before changing model or connector configuration.';

  return {
    schema: DIGEST_SCHEMA,
    status,
    generatedAt: args.generatedAt,
    checks: args.checks,
    recommendation,
  };
}

/**
 * @param {HealthDigest} digest
 */
export function renderHealthDigest(digest) {
  const lines = [
    `GBrain health summary: ${digest.status}`,
    `Generated: ${digest.generatedAt}`,
    `Schema: ${digest.schema}`,
    '',
    ...digest.checks.map(
      check =>
        `- ${check.ok ? 'OK' : check.required === false ? 'WARN' : 'FAIL'} ${check.name} (${check.durationMs}ms): ${check.detail}`
    ),
    '',
    `Recommendation: ${digest.recommendation}`,
  ];
  return lines.join('\n');
}

/**
 * @param {{
 *   exec?: typeof execFileSync,
 *   now?: Date,
 *   healthUrl?: string,
 *   gbrainBin?: string,
 * }} [options]
 * @returns {HealthDigest}
 */
export function collectHealthDigest(options = {}) {
  const exec = options.exec ?? execFileSync;
  const now = options.now ?? new Date();
  const generatedAt = now.toISOString();
  const healthUrl =
    options.healthUrl ??
    process.env.JOVIE_GBRAIN_HEALTH_URL ??
    process.env.HERMES_GBRAIN_HEALTH_URL ??
    'http://127.0.0.1:7801/health';
  const gbrainBin =
    options.gbrainBin ??
    process.env.JOVIE_GBRAIN_BIN ??
    process.env.HERMES_GBRAIN_BIN ??
    'gbrain';

  const checks = [
    timedCheck('http-health', () =>
      statusFromHealthEndpoint(
        exec(
          'curl',
          ['--fail', '--silent', '--show-error', '--max-time', '10', healthUrl],
          {
            encoding: 'utf8',
            timeout: 15_000,
            maxBuffer: 2 * 1024 * 1024,
          }
        )
      )
    ),
    timedCheck(
      'doctor',
      () =>
        statusFromDoctor(
          exec(gbrainBin, ['doctor', '--fast', '--json'], {
            encoding: 'utf8',
            timeout: 30_000,
            maxBuffer: 2 * 1024 * 1024,
          })
        ),
      false
    ),
    timedCheck('source-freshness', () =>
      sourceFreshnessFromOutput(
        exec(gbrainBin, ['sources', 'list', '--json'], {
          encoding: 'utf8',
          timeout: 30_000,
          maxBuffer: 2 * 1024 * 1024,
        }),
        now
      )
    ),
    timedCheck('serve-processes', () =>
      serverProcessStatus(
        exec('pgrep', ['-fl', 'gbrain.*serve'], {
          encoding: 'utf8',
          timeout: 10_000,
          maxBuffer: 2 * 1024 * 1024,
        })
      )
    ),
  ];

  return buildHealthDigest({ generatedAt, checks });
}
