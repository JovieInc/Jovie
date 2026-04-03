import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const { mockExecute, mockLimit, mockWarn } = vi.hoisted(() => ({
  mockExecute: vi.fn((fn: () => Promise<unknown>) => fn()),
  mockLimit: vi.fn(),
  mockWarn: vi.fn(),
}));

vi.mock('@/lib/rate-limit', () => ({
  musicBrainzLookupLimiter: {
    limit: mockLimit,
  },
}));

vi.mock('@/lib/dsp-enrichment/circuit-breakers', () => ({
  musicBrainzCircuitBreaker: {
    execute: mockExecute,
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

vi.mock('@/lib/utils/logger', () => ({
  logger: {
    warn: mockWarn,
  },
}));

import {
  bulkLookupMusicBrainzByIsrc,
  lookupMusicBrainzByIsrc,
  MusicBrainzError,
} from './musicbrainz';

describe('MusicBrainz Provider', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockLimit.mockResolvedValue({
      success: true,
      limit: 1,
      remaining: 1,
      reset: new Date(),
    });
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('does not retry limiter-triggered 429 errors', async () => {
    mockLimit.mockResolvedValue({
      success: false,
      limit: 1,
      remaining: 0,
      reset: new Date(),
      reason: 'Rate limit exceeded',
    });

    await expect(lookupMusicBrainzByIsrc('USUM71703861')).rejects.toEqual(
      expect.objectContaining<Partial<MusicBrainzError>>({
        errorCode: 'RATE_LIMITED',
        statusCode: 429,
      })
    );

    expect(mockLimit).toHaveBeenCalledTimes(1);
    expect(mockExecute).toHaveBeenCalledTimes(1);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('preserves partial bulk results when an ISRC lookup fails', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            recordings: [{ id: 'rec-1' }],
          }),
          { status: 200 }
        )
      )
      .mockResolvedValueOnce(
        new Response('Rate limit exceeded', { status: 429 })
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            recordings: [{ id: 'rec-3' }],
          }),
          { status: 200 }
        )
      );

    vi.stubGlobal('fetch', fetchMock);

    const results = await bulkLookupMusicBrainzByIsrc([
      'USRC17607839',
      'USRC17607840',
      'USRC17607841',
    ]);

    expect(Array.from(results.keys())).toEqual([
      'USRC17607839',
      'USRC17607841',
    ]);
    expect(results.get('USRC17607839')?.id).toBe('rec-1');
    expect(results.get('USRC17607841')?.id).toBe('rec-3');
    expect(mockWarn).toHaveBeenCalledWith(
      'MusicBrainz ISRC lookup failed during bulk lookup',
      expect.objectContaining({
        error: expect.any(MusicBrainzError),
        isrc: 'USRC17607840',
      })
    );
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(mockLimit).toHaveBeenCalledTimes(3);
    expect(mockExecute).toHaveBeenCalledTimes(3);
  });
});
