#!/usr/bin/env tsx
/**
 * Cost Monitor — Hermes-Air
 *
 * Sentinel: any paid spend >$0 in the last 24h kills all non-watchdog
 * launchd jobs and requires manual user confirmation to resume.
 *
 * Runs hourly. Reads OpenRouter usage API and ~/.hermes/logs/cost.jsonl
 * for any inference that slipped onto a paid model.
 */

import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { HERMES_PATHS } from '../lib/hermes-paths';
import { logJobEvent, withJobLogging } from '../lib/jobs-log';
import { sendTelegram } from '../lib/telegram-client';

const JOB = 'cost-monitor';
const KILL_SWITCH_PATH = join(HERMES_PATHS.stateDir, 'cost-kill-switch');

const NON_WATCHDOG_SERVICES = [
  'co.jovie.hermes.daemon',
  'co.jovie.hermes.cron-hud',
  'co.jovie.hermes.cron-pr-monitor',
  'co.jovie.hermes.cron-ci-monitor',
  'co.jovie.hermes.cron-daily-briefing',
  'co.jovie.hermes.cron-deterministic-tracker',
  'co.jovie.hermes.cron-free-model-health',
  'co.jovie.hermes.voice-memo-watcher',
];

function totalLocalPaidSpend(sinceMs: number): number {
  if (!existsSync(HERMES_PATHS.costLog)) return 0;
  try {
    return readFileSync(HERMES_PATHS.costLog, 'utf8')
      .split('\n')
      .filter(Boolean)
      .map(line => {
        try {
          return JSON.parse(line) as { ts?: string; cost?: number };
        } catch {
          return null;
        }
      })
      .filter(
        (entry): entry is { ts: string; cost: number } =>
          entry !== null &&
          typeof entry.ts === 'string' &&
          typeof entry.cost === 'number' &&
          new Date(entry.ts).getTime() >= sinceMs
      )
      .reduce((sum, entry) => sum + entry.cost, 0);
  } catch {
    return 0;
  }
}

async function fetchOpenRouterUsage24h(): Promise<number> {
  const key = process.env.OPENROUTER_API_KEY;
  if (!key) return 0;
  try {
    const response = await fetch('https://openrouter.ai/api/v1/credits', {
      headers: { Authorization: `Bearer ${key}` },
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) return 0;
    const data = (await response.json()) as {
      data?: { usage?: number; limit?: number | null };
    };
    // OpenRouter returns lifetime usage; we treat any increase since the
    // last snapshot as the 24h delta. Snapshot file at state/openrouter-usage.json.
    const snapshotPath = join(HERMES_PATHS.stateDir, 'openrouter-usage.json');
    const usageNow = data.data?.usage ?? 0;
    let usagePrev = 0;
    if (existsSync(snapshotPath)) {
      try {
        const prev = JSON.parse(readFileSync(snapshotPath, 'utf8')) as {
          usage: number;
        };
        usagePrev = prev.usage;
      } catch {
        // ignore
      }
    }
    mkdirSync(HERMES_PATHS.stateDir, { recursive: true });
    writeFileSync(
      snapshotPath,
      JSON.stringify({ usage: usageNow, ts: new Date().toISOString() }, null, 2)
    );
    return Math.max(0, usageNow - usagePrev);
  } catch {
    return 0;
  }
}

function tripKillSwitch(spend: number): void {
  mkdirSync(HERMES_PATHS.stateDir, { recursive: true });
  writeFileSync(
    KILL_SWITCH_PATH,
    JSON.stringify({ trippedAt: new Date().toISOString(), spend }, null, 2)
  );

  const uid = String(execFileSync('id', ['-u'], { encoding: 'utf8' }).trim());
  for (const service of NON_WATCHDOG_SERVICES) {
    try {
      execFileSync('launchctl', ['bootout', `gui/${uid}/${service}`], {
        encoding: 'utf8',
        timeout: 10_000,
      });
    } catch {
      // Service may not be running; non-fatal.
    }
  }
}

async function main(): Promise<void> {
  await withJobLogging(JOB, async () => {
    if (existsSync(KILL_SWITCH_PATH)) {
      logJobEvent({ job: JOB, event: 'kill_switch_already_tripped' });
      return;
    }
    const since = Date.now() - 24 * 3_600 * 1000;
    const localSpend = totalLocalPaidSpend(since);
    const remoteSpend = await fetchOpenRouterUsage24h();
    const totalSpend = localSpend + remoteSpend;

    logJobEvent({
      job: JOB,
      event: 'checked',
      localSpend,
      remoteSpend,
      totalSpend,
    });

    if (totalSpend > 0) {
      tripKillSwitch(totalSpend);
      await sendTelegram(
        `⚠️ *Hermes-Air cost kill switch tripped*\nDetected $${totalSpend.toFixed(4)} in paid model spend in 24h. All non-watchdog services stopped.\n\nInvestigate \`~/.hermes/logs/cost.jsonl\`, then run \`./scripts/hermes/bootstrap-air.sh --resume-after-cost-kill\`.`
      );
    }
  });
}

void main().catch(err => {
  console.error(`[${JOB}] fatal:`, err);
  process.exit(0);
});
