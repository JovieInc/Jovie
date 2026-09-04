#!/usr/bin/env tsx
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

import { gbrainLearn } from '../lib/gbrain';
import { logJobEvent, withJobLogging } from '../lib/jobs-log';
import { sendOpsAlert } from '../lib/ops-notify';

const JOB = 'gbrain-health-summary';
const GBRAIN = process.env.HERMES_GBRAIN_BIN ?? 'gbrain';
const HEALTH_URL =
  process.env.HERMES_GBRAIN_HEALTH_URL ?? 'http://127.0.0.1:7801/health';
const SOURCE_FRESHNESS_HOURS = 48;
const CODE_SOURCE_FRESHNESS_HOURS = 24;

type HealthStatus = 'healthy' | 'degraded' | 'down';
type HealthCheck = {
  readonly name: string;
  readonly ok: boolean;
  readonly detail: string;
  readonly durationMs: number;
  readonly required?: boolean;
};

type HealthSummary = {
  readonly status: HealthStatus;
  readonly generatedAt: string;
  readonly checks: readonly HealthCheck[];
  readonly recommendation: string;
};

type GBrainExec = (
  file: string,
  args: readonly string[],
  options: {
    readonly encoding: 'utf8';
    readonly timeout: number;
    readonly maxBuffer?: number;
  }
) => string;

type GBrainSource = {
  readonly id?: unknown;
  readonly name?: unknown;
  readonly page_count?: unknown;
  readonly last_sync_at?: unknown;
};

function summarizeOutput(output: string, maxChars = 700): string {
  const cleaned = output.replace(/\s+/g, ' ').trim();
  if (!cleaned) return 'empty output';
  return cleaned.length > maxChars
    ? `${cleaned.slice(0, maxChars)}...`
    : cleaned;
}

function statusFromDoctor(output: string): { ok: boolean; detail: string } {
  const text = output.trim();
  if (!text) return { ok: false, detail: 'doctor returned empty output' };
  try {
    const parsed = JSON.parse(text) as Record<string, unknown>;
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

function statusFromHealthEndpoint(output: string): {
  ok: boolean;
  detail: string;
} {
  const text = output.trim();
  if (!text)
    return { ok: false, detail: 'health endpoint returned empty output' };
  try {
    const parsed = JSON.parse(text) as Record<string, unknown>;
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

function sourceFreshnessFromOutput(
  output: string,
  now: Date
): { ok: boolean; detail: string } {
  try {
    const parsed = JSON.parse(output) as { readonly sources?: unknown };
    if (!Array.isArray(parsed.sources) || parsed.sources.length === 0) {
      return { ok: false, detail: 'sources list contained no sources' };
    }
    const stale = parsed.sources.flatMap(raw => {
      if (!raw || typeof raw !== 'object') return ['invalid source record'];
      const source = raw as GBrainSource;
      if (typeof source.page_count !== 'number' || source.page_count === 0) {
        return [];
      }
      const id =
        typeof source.id === 'string'
          ? source.id
          : typeof source.name === 'string'
            ? source.name
            : 'unknown';
      const syncedAt =
        typeof source.last_sync_at === 'string'
          ? new Date(source.last_sync_at)
          : null;
      if (!syncedAt || Number.isNaN(syncedAt.getTime())) {
        return [`${id}: missing last_sync_at`];
      }
      const ageHours = (now.getTime() - syncedAt.getTime()) / 3_600_000;
      const maxAgeHours = /code/i.test(id)
        ? CODE_SOURCE_FRESHNESS_HOURS
        : SOURCE_FRESHNESS_HOURS;
      return ageHours > maxAgeHours
        ? [`${id}: ${Math.floor(ageHours)}h old (max ${maxAgeHours}h)`]
        : [];
    });
    return stale.length === 0
      ? { ok: true, detail: 'all indexed sources are fresh' }
      : { ok: false, detail: `stale sources: ${stale.join(', ')}` };
  } catch {
    return { ok: false, detail: 'sources list returned invalid JSON' };
  }
}

function serverProcessStatus(output: string): { ok: boolean; detail: string } {
  const processes = output
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

function timedCheck(
  name: string,
  run: () => {
    readonly ok: boolean;
    readonly detail: string;
  },
  required = true
): HealthCheck {
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

export function buildGBrainHealthSummary(args: {
  readonly generatedAt: string;
  readonly checks: readonly HealthCheck[];
}): HealthSummary {
  const requiredChecks = args.checks.filter(check => check.required !== false);
  const failed = requiredChecks.filter(check => !check.ok);
  const status: HealthStatus =
    requiredChecks.length === 0 || failed.length === requiredChecks.length
      ? 'down'
      : failed.length === 0
        ? 'healthy'
        : 'degraded';
  const recommendation =
    status === 'healthy'
      ? 'No operator action needed.'
      : 'Check gbrain doctor output, gbrain serve launchd status, and recent Hermes/OpenClaw logs before changing model or connector configuration.';

  return {
    status,
    generatedAt: args.generatedAt,
    checks: args.checks,
    recommendation,
  };
}

export function renderGBrainHealthSummary(summary: HealthSummary): string {
  const lines = [
    `GBrain health summary: ${summary.status}`,
    `Generated: ${summary.generatedAt}`,
    '',
    ...summary.checks.map(
      check =>
        `- ${check.ok ? 'OK' : check.required === false ? 'WARN' : 'FAIL'} ${check.name} (${check.durationMs}ms): ${check.detail}`
    ),
    '',
    `Recommendation: ${summary.recommendation}`,
  ];
  return lines.join('\n');
}

export function collectGBrainHealthSummary(options?: {
  readonly exec?: GBrainExec;
  readonly now?: Date;
  readonly healthUrl?: string;
}): HealthSummary {
  const exec = options?.exec ?? execFileSync;
  const generatedAt = (options?.now ?? new Date()).toISOString();
  const now = options?.now ?? new Date();
  const healthUrl = options?.healthUrl ?? HEALTH_URL;
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
          exec(GBRAIN, ['doctor', '--fast', '--json'], {
            encoding: 'utf8',
            timeout: 30_000,
            maxBuffer: 2 * 1024 * 1024,
          })
        ),
      false
    ),
    timedCheck('source-freshness', () =>
      sourceFreshnessFromOutput(
        exec(GBRAIN, ['sources', 'list', '--json'], {
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

  return buildGBrainHealthSummary({ generatedAt, checks });
}

export async function runGBrainHealthSummary(options?: {
  readonly exec?: GBrainExec;
  readonly learn?: typeof gbrainLearn;
  readonly notify?: boolean;
  readonly writeToGBrain?: boolean;
  readonly notifyOps?: (text: string) => Promise<void>;
  readonly now?: Date;
}): Promise<{
  readonly summary: HealthSummary;
  readonly body: string;
  readonly gbrainOk: boolean;
}> {
  const summary = collectGBrainHealthSummary({
    exec: options?.exec,
    now: options?.now,
  });
  const body = renderGBrainHealthSummary(summary);
  const learn = options?.learn ?? gbrainLearn;
  const gbrainOk =
    options?.writeToGBrain === false
      ? true
      : learn({
          slug: 'ops/gbrain-health/latest',
          title: 'GBrain health summary (latest)',
          body,
          tags: [
            'type:gbrain-health',
            'area:memory',
            `status:${summary.status}`,
          ],
          type: 'gbrain-health',
        });

  logJobEvent({
    job: JOB,
    event: 'summarized',
    status: summary.status,
    checks: summary.checks.map(check => ({
      name: check.name,
      ok: check.ok,
      durationMs: check.durationMs,
    })),
    gbrainOk,
    notified: options?.notify !== false,
  });

  if (options?.notify !== false) {
    try {
      await (options?.notifyOps ?? sendOpsAlert)(body);
    } catch (err) {
      logJobEvent({
        job: JOB,
        event: 'notify-error',
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return { summary, body, gbrainOk };
}

async function main(): Promise<void> {
  await withJobLogging(JOB, async () => {
    const run = await runGBrainHealthSummary();
    process.stdout.write(`${run.body}\n`);
    if (run.summary.status === 'down' || !run.gbrainOk) {
      process.exitCode = 1;
    }
  });
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  void main().catch(err => {
    console.error(`[${JOB}] fatal:`, err);
    process.exit(1);
  });
}
