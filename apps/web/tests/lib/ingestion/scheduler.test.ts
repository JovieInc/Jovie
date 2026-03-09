import { describe, expect, it, vi } from 'vitest';
import {
  calculateBackoff,
  determineJobFailure,
  getCreatorProfileIdFromJob,
} from '@/lib/ingestion/scheduler';
import { ExtractionError } from '@/lib/ingestion/strategies/base';

describe('ingestion scheduler helpers', () => {
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

  it('returns null for unsupported job types', () => {
    const result = getCreatorProfileIdFromJob({
      jobType: 'musicfetch_enrichment',
      payload: {},
    } as never);

    expect(result).toBeNull();
  });
});
