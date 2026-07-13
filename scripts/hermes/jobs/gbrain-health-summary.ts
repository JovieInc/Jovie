#!/usr/bin/env tsx
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

import { gbrainLearn } from '../lib/gbrain';
import { logJobEvent, withJobLogging } from '../lib/jobs-log';
import { notifyOps } from '../lib/ops-notify';

const JOB = 'gbrain-health-summary';
const GBRAIN = process.env.HERMES_GBRAIN_BIN ?? 'gbrain';

type HealthStatus = 'healthy' | 'degraded' | 'down';
type HealthCheck = {
  readonly name: string;
  readonly ok: boolean;
  readonly detail: string;
  readonly durationMs: number;
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

function timedCheck(
  name: string,
  run: () => { readonly ok: boolean; readonly detail: string }
): HealthCheck {
  const started = Date.now();
  try {
    const result = run();
    return {
      name,
      ok: result.ok,
      detail: result.detail,
      durationMs: Date.now() - started,
    };
  } catch (err) {
    return {
      name,
      ok: false,
      detail: err instanceof Error ? err.message : String(err),
      durationMs: Date.now() - started,
    };
  }
}

export function buildGBrainHealthSummary(args: {
  readonly generatedAt: string;
  readonly checks: readonly HealthCheck[];
}): HealthSummary {
  const failed = args.checks.filter(check => !check.ok);
  const status: HealthStatus =
    args.checks.length === 0 || failed.length === args.checks.length
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
        `- ${check.ok ? 'OK' : 'FAIL'} ${check.name} (${check.durationMs}ms): ${check.detail}`
    ),
    '',
    `Recommendation: ${summary.recommendation}`,
  ];
  return lines.join('\n');
}

export function collectGBrainHealthSummary(options?: {
  readonly exec?: GBrainExec;
  readonly now?: Date;
}): HealthSummary {
  const exec = options?.exec ?? execFileSync;
  const generatedAt = (options?.now ?? new Date()).toISOString();
  const checks = [
    timedCheck('doctor', () =>
      statusFromDoctor(
        exec(GBRAIN, ['doctor', '--fast', '--json'], {
          encoding: 'utf8',
          timeout: 30_000,
          maxBuffer: 2 * 1024 * 1024,
        })
      )
    ),
    timedCheck('search', () => {
      const out = exec(
        GBRAIN,
        ['search', 'gbrain health summary smoke', '--limit', '1'],
        {
          encoding: 'utf8',
          timeout: 30_000,
          maxBuffer: 2 * 1024 * 1024,
        }
      );
      const found = out.trim().length > 0;
      return {
        ok: found,
        detail: found ? 'search returned output' : 'empty output',
      };
    }),
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
      await (options?.notifyOps ?? notifyOps)(body);
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
