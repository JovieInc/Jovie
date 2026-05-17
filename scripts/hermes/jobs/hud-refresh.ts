#!/usr/bin/env tsx
/**
 * HUD Refresh — Hermes-Air
 *
 * Pings the deployed HUD AI-Ops summary endpoint, caches the result locally,
 * and flags anomalies (merge-queue pressure, blocker spikes, deploy health).
 *
 * Read-only: never writes to GitHub or Linear. Anomalies are surfaced via
 * Telegram only.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { HERMES_PATHS } from '../lib/hermes-paths';
import { logJobEvent, withJobLogging } from '../lib/jobs-log';
import { sendTelegram } from '../lib/telegram-client';

const JOB = 'hud-refresh';

const HUD_ENDPOINT =
  process.env.HERMES_HUD_ENDPOINT ?? 'https://jov.ie/api/hud/ai-ops/summary';
const HUD_API_KEY = process.env.HERMES_HUD_API_KEY ?? '';

interface HudSummary {
  readonly openPrs: number;
  readonly openAgentPrs: number;
  readonly blockers: number;
  readonly mergeQueuePressure: 'low' | 'elevated' | 'high';
  readonly recommendations: ReadonlyArray<string>;
}

const SNAPSHOT_PATH = join(HERMES_PATHS.stateDir, 'hud-snapshot.json');

function loadPreviousSnapshot(): HudSummary | null {
  if (!existsSync(SNAPSHOT_PATH)) return null;
  try {
    return JSON.parse(readFileSync(SNAPSHOT_PATH, 'utf8')) as HudSummary;
  } catch {
    return null;
  }
}

function saveSnapshot(summary: HudSummary): void {
  mkdirSync(HERMES_PATHS.stateDir, { recursive: true });
  writeFileSync(SNAPSHOT_PATH, JSON.stringify(summary, null, 2));
}

async function fetchSummary(): Promise<HudSummary> {
  const response = await fetch(HUD_ENDPOINT, {
    headers: HUD_API_KEY ? { Authorization: `Bearer ${HUD_API_KEY}` } : {},
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) {
    throw new Error(
      `HUD ${response.status}: ${await response.text().catch(() => '')}`
    );
  }
  return (await response.json()) as HudSummary;
}

function detectAnomalies(
  current: HudSummary,
  previous: HudSummary | null
): ReadonlyArray<string> {
  const anomalies: string[] = [];
  if (current.mergeQueuePressure === 'high') {
    anomalies.push(
      `Merge queue pressure HIGH (${current.openAgentPrs} open agent PRs)`
    );
  }
  if (previous && current.blockers > previous.blockers + 2) {
    anomalies.push(
      `Blockers jumped ${previous.blockers} → ${current.blockers}`
    );
  }
  return anomalies;
}

async function main(): Promise<void> {
  await withJobLogging(JOB, async () => {
    const summary = await fetchSummary();
    const previous = loadPreviousSnapshot();
    saveSnapshot(summary);
    const anomalies = detectAnomalies(summary, previous);
    logJobEvent({
      job: JOB,
      event: 'refreshed',
      summary,
      anomalyCount: anomalies.length,
    });
    if (anomalies.length > 0) {
      await sendTelegram(
        `🚨 *HUD anomaly*\n${anomalies.map(a => `• ${a}`).join('\n')}`
      );
    }
  });
}

void main().catch(err => {
  console.error(`[${JOB}] fatal:`, err);
  process.exit(0);
});
