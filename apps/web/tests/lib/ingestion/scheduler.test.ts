import { afterEach, describe, expect, it, vi } from 'vitest';

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
  determineJobFailure,
  failJob,
  getCreatorProfileIdFromJob,
  handleIngestionJobFailure,
} from '@/lib/ingestion/scheduler';
import { ExtractionError } from '@/lib/ingestion/strategies/base';
import {
  MusicfetchBudgetExceededError,
  MusicfetchRequestError,
} from '@/lib/musicfetch/errors';

describe('ingestion scheduler helpers', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('uses larger backoff profile for rate-limited failures', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.25);

    const transient = calculateBackoff(1, 'transient');
    const rateLimited = calculateBackoff(1, 'rate_limited');

    expect(rateLimited).toBeGreaterThan(transient);
  });

  it('classifies ExtractionError(RATE_LIMITED) as rate_limited', () => {
    const error = new ExtractionError('too many requests', 'RATE_LIMITED', 429);

    expect(determineJobFailure(error)).toEqual({
      message: 'too many requests',
      reason: 'rate_limited',
    });
  });

  it('classifies MusicFetch 429 errors as rate_limited', () => {
    const error = new MusicfetchRequestError(
      'MusicFetch local/global rate limit exceeded',
      429,
      60
    );

    expect(determineJobFailure(error)).toEqual({
      message: 'MusicFetch local/global rate limit exceeded',
      reason: 'rate_limited',
    });
  });

  it('classifies MusicFetch budget exhaustion as rate_limited', () => {
    const error = new MusicfetchBudgetExceededError(
      'MusicFetch daily hard budget exhausted',
      'daily',
      3600
    );

    expect(determineJobFailure(error)).toEqual({
      message: 'MusicFetch daily hard budget exhausted',
      reason: 'rate_limited',
    });
  });

  it('classifies invalid-services MusicFetch 400 errors as permanent', () => {
    const error = new MusicfetchRequestError(
      'MusicFetch API error: 400 - services - Invalid value "soundCloud"',
      400,
      undefined,
      'services - Invalid value "soundCloud"'
    );

    expect(determineJobFailure(error)).toEqual({
      message:
        'MusicFetch API error: 400 - services - Invalid value "soundCloud"',
      reason: 'permanent',
    });
  });

  it('does not schedule retries for permanent failures', async () => {
    const where = vi.fn().mockResolvedValue(undefined);
    const set = vi.fn().mockReturnValue({ where });
    const update = vi.fn().mockReturnValue({ set });
    const tx = { update } as never;

    await failJob(
      tx,
      {
        id: 'job-1',
        attempts: 1,
        maxAttempts: 3,
      } as never,
      'Invalid MusicFetch services configured',
      { reason: 'permanent' }
    );

    expect(update).toHaveBeenCalled();
    expect(set).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'failed',
        error: 'Invalid MusicFetch services configured',
      })
    );
    expect(where).toHaveBeenCalled();
  });

  it('marks permanent failures as failed immediately in handleIngestionJobFailure', async () => {
    const where = vi.fn().mockResolvedValue(undefined);
    const set = vi.fn().mockReturnValue({ where });
    const update = vi.fn().mockReturnValue({ set });
    const tx = { update } as never;
    const error = new MusicfetchRequestError(
      'MusicFetch API error: 400 - services - Invalid value "soundCloud"',
      400,
      undefined,
      'services - Invalid value "soundCloud"'
    );

    await handleIngestionJobFailure(
      tx,
      {
        id: 'job-1',
        jobType: 'musicfetch_enrichment',
        payload: {
          creatorProfileId: '7e093f2b-a8f9-4559-a9df-8f789b4432f8',
          spotifyUrl: 'https://open.spotify.com/artist/123',
          dedupKey: 'musicfetch_enrichment:123',
        },
        attempts: 1,
        maxAttempts: 3,
      } as never,
      error
    );

    expect(mockRecordErrorForRetry).not.toHaveBeenCalled();
    expect(mockMarkFailedAfterRetries).toHaveBeenCalled();
    expect(mockCaptureError).toHaveBeenCalledWith(
      'Ingestion job permanently failed',
      error,
      expect.objectContaining({
        jobId: 'job-1',
        reason: 'permanent',
      })
    );
    expect(set).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'failed',
      })
    );
  });

  it('extracts creatorProfileId for valid ingestion payloads', () => {
    const creatorProfileId = '7e093f2b-a8f9-4559-a9df-8f789b4432f8';

    const result = getCreatorProfileIdFromJob({
      jobType: 'import_linktree',
      payload: {
        creatorProfileId,
        sourceUrl: 'https://linktr.ee/example',
        depth: 0,
      },
    } as never);

    expect(result).toBe(creatorProfileId);
  });

  it('extracts creatorProfileId for musicfetch enrichment payloads', () => {
    const creatorProfileId = '7e093f2b-a8f9-4559-a9df-8f789b4432f8';

    const result = getCreatorProfileIdFromJob({
      jobType: 'musicfetch_enrichment',
      payload: {
        creatorProfileId,
        spotifyUrl: 'https://open.spotify.com/artist/123',
        dedupKey: 'musicfetch_enrichment:123',
      },
    } as never);

    expect(result).toBe(creatorProfileId);
  });

  it('returns null for unsupported job types', () => {
    const result = getCreatorProfileIdFromJob({
      jobType: 'unsupported',
      payload: {},
    } as never);

    expect(result).toBeNull();
  });
});
