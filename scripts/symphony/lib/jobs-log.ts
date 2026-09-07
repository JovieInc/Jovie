/**
 * Structured JSONL logger for Hermes cron jobs. Best-effort, never throws.
 */

import { appendFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

import { HERMES_PATHS } from './hermes-paths';

export interface JobLogEntry {
  readonly job: string;
  readonly event: string;
  readonly [key: string]: unknown;
}

export function logJobEvent(entry: JobLogEntry): void {
  try {
    mkdirSync(dirname(HERMES_PATHS.jobsLog), { recursive: true });
    appendFileSync(
      HERMES_PATHS.jobsLog,
      `${JSON.stringify({ ...entry, ts: new Date().toISOString() })}\n`
    );
  } catch {
    // never throw from logging
  }
}

/** Wrap a job's main function with start/finish/error events. */
export async function withJobLogging<T>(
  job: string,
  fn: () => Promise<T>
): Promise<T> {
  const start = Date.now();
  logJobEvent({ job, event: 'start' });
  try {
    const result = await fn();
    logJobEvent({ job, event: 'finish', durationMs: Date.now() - start });
    return result;
  } catch (err) {
    logJobEvent({
      job,
      event: 'error',
      durationMs: Date.now() - start,
      error: err instanceof Error ? err.message : String(err),
    });
    throw err;
  }
}
