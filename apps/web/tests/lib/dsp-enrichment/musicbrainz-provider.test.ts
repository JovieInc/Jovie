import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const { mockLimit, mockExecute } = vi.hoisted(() => ({
  mockLimit: vi.fn(),
  mockExecute: vi.fn((fn: () => Promise<unknown>) => fn()),
}));

vi.mock('@/lib/rate-limit', () => ({
  musicBrainzLookupLimiter: {
    limit: (...args: unknown[]) => mockLimit(...args),
  },
}));

vi.mock('@/lib/dsp-enrichment/circuit-breakers', () => ({
  musicBrainzCircuitBreaker: {
    execute: (...args: unknown[]) => mockExecute(...args),
    getState: vi.fn(() => 'CLOSED'),
    getStats: vi.fn(() => ({
      state: 'CLOSED',
      failures: 0,
      successes: 0,
      lastFailureTime: null,
      lastStateChange: Date.now(),
      totalFailures: 0,
      totalSuccesses: 0,
      requestsInWindow: 0,
    })),
  },
}));

import { lookupMusicBrainzByIsrc, MusicBrainzError } from '@/lib/dsp-enrichment/providers/musicbrainz';

describe('MusicBrainz Provider', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockLimit.mockResolvedValue({
      success: false,
      limit: 1,
      remaining: 0,
      reset: new Date(),
      reason: 'Rate limit exceeded',
    });
  });

  it('does not retry limiter-triggered 429 errors', async () => {
    await expect(lookupMusicBrainzByIsrc('USUM71703861')).rejects.toEqual(
      expect.objectContaining<Partial<MusicBrainzError>>({
        statusCode: 429,
        errorCode: 'RATE_LIMITED',
      })
    );

    expect(mockLimit).toHaveBeenCalledTimes(1);
    expect(mockExecute).toHaveBeenCalledTimes(1);
  });
});
