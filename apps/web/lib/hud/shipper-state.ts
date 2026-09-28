import 'server-only';

import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import type {
  HudInflightJob,
  HudShipperCapacity,
  HudShipperState,
  HudShipperStatusPayload,
  HudWhatShippedEntry,
  HudWhatShippedPayload,
} from '@/types/hud-shipper';

const SHIPPER_JOB = 'codex-issue-shipper';
const JOBS_LOG_PATH = join(homedir(), '.hermes', 'logs', 'jobs.jsonl');
const PAUSE_SENTINEL_PATH = join(homedir(), '.hermes', 'shipping-paused');
const INFLIGHT_JOURNAL_PATH = join(
  homedir(),
  '.hermes',
  'state',
  'inflight-ship-jobs.json'
);
const WHAT_SHIPPED_PATH = join(
  homedir(),
  '.hermes',
  'state',
  'what_shipped.json'
);
const SHIPPER_ERR_LOG_PATH = join(
  homedir(),
  '.hermes',
  'logs',
  'launchd',
  'cron-codex-issue-shipper.err.log'
);

interface ShipperLogEvent {
  readonly job?: string;
  readonly event?: string;
  readonly ts?: string;
  readonly dispatchableCount?: number;
  readonly capacity?: HudShipperCapacity;
  readonly plans?: ReadonlyArray<{
    readonly issue: number;
    readonly branch: string;
  }>;
  readonly error?: string;
}

function hermesStateAvailable(): boolean {
  return existsSync(join(homedir(), '.hermes'));
}

function tailLines(path: string, maxLines: number): string[] {
  if (!existsSync(path)) return [];
  try {
    const content = readFileSync(path, 'utf8');
    return content
      .split('\n')
      .map(line => line.trim())
      .filter(Boolean)
      .slice(-maxLines);
  } catch {
    return [];
  }
}

function parseShipperEvents(lines: readonly string[]): ShipperLogEvent[] {
  const events: ShipperLogEvent[] = [];
  for (const line of lines) {
    try {
      const parsed = JSON.parse(line) as ShipperLogEvent;
      if (parsed.job === SHIPPER_JOB) {
        events.push(parsed);
      }
    } catch {
      // Skip malformed JSONL rows.
    }
  }
  return events;
}

function readInflightJobs(): HudInflightJob[] {
  if (!existsSync(INFLIGHT_JOURNAL_PATH)) return [];
  try {
    const parsed = JSON.parse(readFileSync(INFLIGHT_JOURNAL_PATH, 'utf8'));
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (entry): entry is HudInflightJob =>
        typeof entry === 'object' &&
        entry !== null &&
        typeof (entry as HudInflightJob).issue === 'number' &&
        typeof (entry as HudInflightJob).pid === 'number'
    );
  } catch {
    return [];
  }
}

function resolveShipperState(
  events: readonly ShipperLogEvent[],
  isPaused: boolean
): HudShipperState {
  if (isPaused) return 'paused';

  const lastStart = [...events]
    .reverse()
    .find(event => event.event === 'start');
  const lastFinish = [...events]
    .reverse()
    .find(event => event.event === 'finish');
  const lastFatal = [...events]
    .reverse()
    .find(event => event.event === 'fatal');

  let state: HudShipperState = 'idle';
  if (lastStart && lastFinish) {
    state = (lastStart.ts ?? '') > (lastFinish.ts ?? '') ? 'running' : 'idle';
  } else if (lastStart) {
    state = 'running';
  } else if (events.length === 0) {
    state = 'not_running';
  }

  if (lastFatal) {
    const fatalTs = lastFatal.ts ?? '';
    const finishTs = lastFinish?.ts ?? '';
    if (!lastFinish || fatalTs > finishTs) {
      state = 'error';
    }
  }

  return state;
}

function formatAgentLabel(
  plans: ReadonlyArray<{ readonly issue: number; readonly branch: string }>
): string[] {
  return plans.map(plan => `#${plan.issue} → ${plan.branch}`);
}

function readRecentErrors(): string[] {
  const lines = tailLines(SHIPPER_ERR_LOG_PATH, 40);
  return lines.slice(-5);
}

export function getHudShipperStatus(): HudShipperStatusPayload {
  const generatedAtIso = new Date().toISOString();

  if (!hermesStateAvailable()) {
    return {
      availability: 'unavailable',
      state: 'not_running',
      isPaused: false,
      launchdLoaded: false,
      lastRunAt: null,
      lastResult: null,
      dispatchableCount: 0,
      inFlightCount: 0,
      inFlightJobs: [],
      currentAgents: [],
      lastError: null,
      recentErrors: [],
      capacity: null,
      generatedAtIso,
    };
  }

  const events = parseShipperEvents(tailLines(JOBS_LOG_PATH, 200));
  const isPaused = existsSync(PAUSE_SENTINEL_PATH);
  const inFlightJobs = readInflightJobs();
  const lastFinish = [...events]
    .reverse()
    .find(event => event.event === 'finish');
  const lastFatal = [...events]
    .reverse()
    .find(event => event.event === 'fatal');
  const lastScanned = [...events]
    .reverse()
    .find(event => event.event === 'scanned');
  const lastPlanned = [...events]
    .reverse()
    .find(event => event.event === 'dry_run_planned');

  let lastResult: string | null = null;
  if (lastFinish) {
    const finishIndex = events.findIndex(
      event => event.event === 'finish' && event.ts === lastFinish.ts
    );
    const preceding = events.slice(0, finishIndex).reverse();
    const meaningful = preceding.find(event =>
      [
        'empty_queue',
        'capacity_throttled',
        'dry_run_planned',
        'singleton_active_skip',
        'scanned',
      ].includes(event.event ?? '')
    );
    let lastResultLabel = 'Finished';
    if (meaningful?.event === 'empty_queue') lastResultLabel = 'Empty queue';
    else if (meaningful?.event === 'capacity_throttled') {
      lastResultLabel = 'Throttled';
    } else if (meaningful?.event === 'dry_run_planned') {
      lastResultLabel = 'Dry run planned';
    } else if (meaningful?.event === 'singleton_active_skip') {
      lastResultLabel = 'Singleton skip';
    } else if (meaningful?.event === 'scanned') lastResultLabel = 'Scanned';
    lastResult = lastResultLabel;
  }

  return {
    availability: 'available',
    state: resolveShipperState(events, isPaused),
    isPaused,
    launchdLoaded: events.length > 0,
    lastRunAt: lastFinish?.ts ?? null,
    lastResult,
    dispatchableCount: lastScanned?.dispatchableCount ?? 0,
    inFlightCount: inFlightJobs.length,
    inFlightJobs,
    currentAgents: lastPlanned?.plans
      ? formatAgentLabel(lastPlanned.plans)
      : [],
    lastError: lastFatal?.error ?? null,
    recentErrors: readRecentErrors(),
    capacity: lastScanned?.capacity ?? null,
    generatedAtIso,
  };
}

function shippedNumber(primary: unknown, fallback: unknown): number | null {
  if (typeof primary === 'number') return primary;
  if (typeof fallback === 'number') return fallback;
  return null;
}

function normalizeWhatShippedEntry(value: unknown): HudWhatShippedEntry | null {
  if (typeof value !== 'object' || value === null) return null;
  const record = value as Record<string, unknown>;
  const title = typeof record.title === 'string' ? record.title : null;
  let mergedAt: string | null = null;
  if (typeof record.mergedAt === 'string') mergedAt = record.mergedAt;
  else if (typeof record.shippedAt === 'string') mergedAt = record.shippedAt;
  if (!title || !mergedAt) return null;

  return {
    prNumber: shippedNumber(record.prNumber, record.pr),
    title,
    mergedAt,
    url: typeof record.url === 'string' ? record.url : null,
    issueNumber: shippedNumber(record.issueNumber, record.issue),
  };
}

export function getHudWhatShipped(): HudWhatShippedPayload {
  const generatedAtIso = new Date().toISOString();

  if (!existsSync(WHAT_SHIPPED_PATH)) {
    return {
      availability: 'unavailable',
      entries: [],
      generatedAtIso,
    };
  }

  try {
    const parsed = JSON.parse(readFileSync(WHAT_SHIPPED_PATH, 'utf8'));
    let rawEntries: unknown[] = [];
    if (Array.isArray(parsed)) rawEntries = parsed;
    else if (Array.isArray((parsed as { entries?: unknown }).entries)) {
      rawEntries = (parsed as { entries: unknown[] }).entries;
    }

    const entries = rawEntries
      .map(normalizeWhatShippedEntry)
      .filter((entry): entry is HudWhatShippedEntry => entry !== null)
      .slice(0, 20);

    return {
      availability: 'available',
      entries,
      generatedAtIso,
    };
  } catch {
    return {
      availability: 'unavailable',
      entries: [],
      generatedAtIso,
    };
  }
}
