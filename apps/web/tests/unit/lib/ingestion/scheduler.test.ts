import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { DbOrTransaction } from '@/lib/db';
import { ingestionJobs } from '@/lib/db/schema/ingestion';

// Mutation-sensitive coverage for the ingestion job scheduler's retry/backoff
// logic. The cron route test (tests/unit/api/cron/process-ingestion-jobs.test.ts)
// mocks '@/lib/ingestion/processor' wholesale, so it never exercises the real
// backoff math, retry/terminal branching, or the exact DB payloads written
// here. A regression in this file silently breaks retry scheduling for every
// ingestion job type (Linktree, Laylo, YouTube, Beacons, Instagram, TikTok,
// Twitter, claim-invite email, Musicfetch enrichment).

const {
  mockCaptureError,
  mockMarkFailedAfterRetries,
  mockRecordErrorForRetry,
} = vi.hoisted(() => ({
  mockCaptureError: vi.fn(),
  mockMarkFailedAfterRetries: vi.fn(),
  mockRecordErrorForRetry: vi.fn(),
}));

vi.mock('@/lib/error-tracking', () => ({
  captureError: (...args: unknown[]) => mockCaptureError(...args),
}));

vi.mock('@/lib/ingestion/status-manager', () => ({
  IngestionStatusManager: {
    markFailedAfterRetries: (...args: unknown[]) =>
      mockMarkFailedAfterRetries(...args),
    recordErrorForRetry: (...args: unknown[]) =>
      mockRecordErrorForRetry(...args),
  },
}));

import {
  calculateBackoff,
  failJob,
  handleIngestionJobFailure,
  resetJobForRetry,
  succeedJob,
} from '@/lib/ingestion/scheduler';
import { MusicfetchRequestError } from '@/lib/musicfetch/errors';

type IngestionJobRow = typeof ingestionJobs.$inferSelect;

const CREATOR_PROFILE_ID = '7e093f2b-a8f9-4559-a9df-8f789b4432f8';
const FIXED_NOW = new Date('2026-01-15T12:00:00.000Z');

function makeJob(overrides: Partial<IngestionJobRow> = {}): IngestionJobRow {
  return {
    id: 'job-1',
    jobType: 'import_linktree',
    payload: {
      creatorProfileId: CREATOR_PROFILE_ID,
      sourceUrl: 'https://linktr.ee/example',
      depth: 0,
    },
    status: 'processing',
    error: null,
    attempts: 1,
    priority: 0,
    maxAttempts: 3,
    runAt: FIXED_NOW,
    nextRunAt: null,
    dedupKey: null,
    createdAt: FIXED_NOW,
    updatedAt: FIXED_NOW,
    ...overrides,
  } as IngestionJobRow;
}

/** Mock tx for functions that end the chain with a bare `.where(...)` (no `.returning()`). */
function createUpdateTxMock() {
  const where = vi.fn().mockResolvedValue(undefined);
  const set = vi.fn().mockReturnValue({ where });
  const update = vi.fn().mockReturnValue({ set });
  return { tx: { update } as unknown as DbOrTransaction, update, set, where };
}

/** Mock tx for resetJobForRetry, which chains `.where(...).returning(...)`. */
function createReturningTxMock(returningResult: Array<{ id: string }>) {
  const returning = vi.fn().mockResolvedValue(returningResult);
  const where = vi.fn().mockReturnValue({ returning });
  const set = vi.fn().mockReturnValue({ where });
  const update = vi.fn().mockReturnValue({ set });
  return {
    tx: { update } as unknown as DbOrTransaction,
    update,
    set,
    where,
    returning,
  };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(FIXED_NOW);
});

afterEach(() => {
  vi.clearAllMocks();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('calculateBackoff', () => {
  it('computes exponential growth for transient failures (attempt 1)', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    // base(5000) * 2^(1-1) + jitter(0) = 5000
    expect(calculateBackoff(1, 'transient')).toBe(5000);
  });

  it('computes exponential growth for transient failures (attempt 4)', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    // base(5000) * 2^(4-1) + jitter(0) = 40000
    expect(calculateBackoff(4, 'transient')).toBe(40000);
  });

  it('caps transient backoff at MAX_BACKOFF_MS (300000)', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    // base(5000) * 2^(7-1) = 320000, which exceeds the 300000 cap
    expect(calculateBackoff(7, 'transient')).toBe(300000);
  });

  it('applies jitter within the transient jitter range (1000ms)', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.4);
    // base(5000) * 2^0 + (0.4 * 1000) = 5400
    expect(calculateBackoff(1, 'transient')).toBe(5400);
  });

  it('uses a larger base and cap for rate-limited failures (attempt 1)', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    // base(30000) * 2^(1-1) + jitter(0) = 30000
    expect(calculateBackoff(1, 'rate_limited')).toBe(30000);
  });

  it('applies a wider jitter range (5000ms) for rate-limited failures', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.4);
    // base(30000) * 2^0 + (0.4 * 5000) = 32000
    expect(calculateBackoff(1, 'rate_limited')).toBe(32000);
  });

  it('caps rate-limited backoff at RATE_LIMIT_MAX_BACKOFF_MS (900000)', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    // base(30000) * 2^(6-1) = 960000, which exceeds the 900000 cap
    expect(calculateBackoff(6, 'rate_limited')).toBe(900000);
  });

  it('defaults to the transient profile when no reason is provided', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    expect(calculateBackoff(2)).toBe(calculateBackoff(2, 'transient'));
    expect(calculateBackoff(2)).toBe(10000);
  });

  it('treats "permanent" the same as "transient" for backoff math', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    // Only 'rate_limited' gets a distinct profile; 'permanent' shares the
    // default base/cap/jitter with 'transient' (it just never gets scheduled
    // because shouldRetryJob short-circuits on reason === 'permanent').
    expect(calculateBackoff(3, 'permanent')).toBe(
      calculateBackoff(3, 'transient')
    );
    expect(calculateBackoff(3, 'permanent')).toBe(20000);
  });
});

describe('handleIngestionJobFailure', () => {
  it('schedules a retry when attempts are below maxAttempts (transient error)', async () => {
    const { tx, set, where } = createUpdateTxMock();
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const job = makeJob({ attempts: 1, maxAttempts: 3 });
    const error = new Error('network blip');

    await handleIngestionJobFailure(tx, job, error);

    // calculateBackoff(1, 'transient') = 5000ms with Math.random stubbed to 0
    const expectedNextRunAt = new Date(FIXED_NOW.getTime() + 5000);

    expect(mockRecordErrorForRetry).toHaveBeenCalledWith(
      tx,
      CREATOR_PROFILE_ID,
      'network blip'
    );
    expect(mockMarkFailedAfterRetries).not.toHaveBeenCalled();
    expect(mockCaptureError).not.toHaveBeenCalled();

    expect(set).toHaveBeenCalledWith({
      status: 'pending',
      error: 'network blip',
      nextRunAt: expectedNextRunAt,
      runAt: expectedNextRunAt,
      updatedAt: FIXED_NOW,
    });
    expect(where).toHaveBeenCalledWith(eq(ingestionJobs.id, 'job-1'));
  });

  it('retries at attempts === maxAttempts - 1 (boundary: one below the limit)', async () => {
    const { tx } = createUpdateTxMock();
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const job = makeJob({ attempts: 2, maxAttempts: 3 });

    await handleIngestionJobFailure(tx, job, new Error('still flaky'));

    expect(mockRecordErrorForRetry).toHaveBeenCalledWith(
      tx,
      CREATOR_PROFILE_ID,
      'still flaky'
    );
    expect(mockMarkFailedAfterRetries).not.toHaveBeenCalled();
  });

  it('abandons the job permanently once attempts === maxAttempts (boundary: at the limit)', async () => {
    const { tx, set } = createUpdateTxMock();
    const job = makeJob({ attempts: 3, maxAttempts: 3 });
    const error = new Error('still failing');

    await handleIngestionJobFailure(tx, job, error);

    expect(mockMarkFailedAfterRetries).toHaveBeenCalledWith(
      tx,
      CREATOR_PROFILE_ID,
      'still failing'
    );
    expect(mockRecordErrorForRetry).not.toHaveBeenCalled();
    expect(mockCaptureError).toHaveBeenCalledWith(
      'Ingestion job permanently failed',
      error,
      {
        jobId: 'job-1',
        jobType: 'import_linktree',
        attempts: 3,
        maxAttempts: 3,
        reason: 'transient',
      }
    );

    // Terminal failJob branch: only status/error/updatedAt are written, no
    // nextRunAt/runAt (there is nothing to schedule).
    expect(set).toHaveBeenCalledWith({
      status: 'failed',
      error: 'still failing',
      updatedAt: FIXED_NOW,
    });
  });

  it('abandons the job immediately for a permanent-reason error, even with attempts well below maxAttempts', async () => {
    const { tx, set } = createUpdateTxMock();
    const job = makeJob({ attempts: 1, maxAttempts: 3 });
    // MusicFetch 400 "invalid services" classifies as reason: 'permanent'
    // per determineJobFailure.
    const error = new MusicfetchRequestError(
      'MusicFetch API error: 400 - services - Invalid value "soundCloud"',
      400,
      undefined,
      'services - Invalid value "soundCloud"'
    );

    await handleIngestionJobFailure(tx, job, error);

    expect(mockMarkFailedAfterRetries).toHaveBeenCalledWith(
      tx,
      CREATOR_PROFILE_ID,
      error.message
    );
    expect(mockRecordErrorForRetry).not.toHaveBeenCalled();
    expect(set).toHaveBeenCalledWith({
      status: 'failed',
      error: error.message,
      updatedAt: FIXED_NOW,
    });
  });

  it('skips IngestionStatusManager calls entirely when no creatorProfileId can be extracted', async () => {
    const { tx, set } = createUpdateTxMock();
    const job = makeJob({
      jobType: 'unsupported_job_type',
      payload: { foo: 'bar' },
      attempts: 3,
      maxAttempts: 3,
    });
    const error = new Error('boom');

    await handleIngestionJobFailure(tx, job, error);

    expect(mockRecordErrorForRetry).not.toHaveBeenCalled();
    expect(mockMarkFailedAfterRetries).not.toHaveBeenCalled();
    // captureError and failJob still run for the terminal branch.
    expect(mockCaptureError).toHaveBeenCalledWith(
      'Ingestion job permanently failed',
      error,
      expect.objectContaining({ jobId: 'job-1' })
    );
    expect(set).toHaveBeenCalledWith({
      status: 'failed',
      error: 'boom',
      updatedAt: FIXED_NOW,
    });
  });
});

describe('failJob', () => {
  it('writes a pending/rescheduled payload with the exact backoff-derived nextRunAt/runAt when retrying', async () => {
    const { tx, update, set, where } = createUpdateTxMock();
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const job = makeJob({ id: 'job-42', attempts: 2, maxAttempts: 5 });

    await failJob(tx, job, 'transient failure', { reason: 'transient' });

    // calculateBackoff(2, 'transient') = 5000 * 2^1 + 0 = 10000ms
    const expectedNextRunAt = new Date(FIXED_NOW.getTime() + 10000);

    expect(set).toHaveBeenCalledWith({
      status: 'pending',
      error: 'transient failure',
      nextRunAt: expectedNextRunAt,
      runAt: expectedNextRunAt,
      updatedAt: FIXED_NOW,
    });
    expect(update).toHaveBeenCalledWith(ingestionJobs);
    expect(where).toHaveBeenCalledWith(eq(ingestionJobs.id, 'job-42'));
  });

  it('uses the rate-limited backoff profile when reason is rate_limited', async () => {
    const { tx, set } = createUpdateTxMock();
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const job = makeJob({ id: 'job-42', attempts: 1, maxAttempts: 5 });

    await failJob(tx, job, 'rate limited', { reason: 'rate_limited' });

    // calculateBackoff(1, 'rate_limited') = 30000ms
    const expectedNextRunAt = new Date(FIXED_NOW.getTime() + 30000);

    expect(set).toHaveBeenCalledWith({
      status: 'pending',
      error: 'rate limited',
      nextRunAt: expectedNextRunAt,
      runAt: expectedNextRunAt,
      updatedAt: FIXED_NOW,
    });
  });

  it('writes a terminal failed payload (no nextRunAt/runAt) when shouldRetry is false', async () => {
    const { tx, update, set, where } = createUpdateTxMock();
    const job = makeJob({ id: 'job-99', attempts: 3, maxAttempts: 3 });

    await failJob(tx, job, 'exhausted retries', { reason: 'transient' });

    expect(set).toHaveBeenCalledWith({
      status: 'failed',
      error: 'exhausted retries',
      updatedAt: FIXED_NOW,
    });
    expect(update).toHaveBeenCalledWith(ingestionJobs);
    expect(where).toHaveBeenCalledWith(eq(ingestionJobs.id, 'job-99'));
  });

  it('defaults to reason "transient" when no options are provided', async () => {
    const { tx, set } = createUpdateTxMock();
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const job = makeJob({ id: 'job-1', attempts: 1, maxAttempts: 3 });

    await failJob(tx, job, 'no reason supplied');

    // transient profile: base(5000) * 2^0 = 5000ms
    const expectedNextRunAt = new Date(FIXED_NOW.getTime() + 5000);
    expect(set).toHaveBeenCalledWith({
      status: 'pending',
      error: 'no reason supplied',
      nextRunAt: expectedNextRunAt,
      runAt: expectedNextRunAt,
      updatedAt: FIXED_NOW,
    });
  });
});

describe('succeedJob', () => {
  it('marks the job succeeded, clears the error, and stamps updatedAt', async () => {
    const { tx, update, set, where } = createUpdateTxMock();
    const job = makeJob({ id: 'job-7', status: 'processing', error: 'flaky' });

    await succeedJob(tx, job);

    expect(update).toHaveBeenCalledWith(ingestionJobs);
    expect(set).toHaveBeenCalledWith({
      status: 'succeeded',
      error: null,
      updatedAt: FIXED_NOW,
    });
    expect(where).toHaveBeenCalledWith(eq(ingestionJobs.id, 'job-7'));

    // Note: succeedJob performs no deletion/retention logic of its own. The
    // 7-day ingestion-job retention/deletion rule referenced in the task
    // brief actually lives in a separate module
    // (apps/web/lib/analytics/data-retention.ts, invoked from
    // apps/web/app/api/cron/data-retention/route.ts as
    // `runDataRetentionCleanup` -> `ingestionJobsDeleted`), not in
    // scheduler.ts. Confirmed by reading the full file; there is no
    // date-based cutoff or delete call anywhere in succeedJob/failJob/
    // resetJobForRetry/handleIngestionJobFailure. That retention path is out
    // of scope for this file and is not covered here.
  });
});

describe('resetJobForRetry', () => {
  it('resets attempts to 0, clears error/nextRunAt, and re-queues runAt to now', async () => {
    const { tx, update, set, where, returning } = createReturningTxMock([
      { id: 'job-5' },
    ]);

    const result = await resetJobForRetry(tx, 'job-5');

    expect(set).toHaveBeenCalledWith({
      status: 'pending',
      error: null,
      attempts: 0,
      runAt: FIXED_NOW,
      nextRunAt: null,
      updatedAt: FIXED_NOW,
    });
    expect(update).toHaveBeenCalledWith(ingestionJobs);
    expect(where).toHaveBeenCalledWith(eq(ingestionJobs.id, 'job-5'));
    expect(returning).toHaveBeenCalledWith({ id: ingestionJobs.id });
    expect(result).toBe(true);
  });

  it('returns false when no row matches the given jobId', async () => {
    const { tx } = createReturningTxMock([]);

    const result = await resetJobForRetry(tx, 'missing-job');

    expect(result).toBe(false);
  });
});
