import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockAuth = vi.hoisted(() => vi.fn());
const mockAppleMusicSearchLimiterLimit = vi.hoisted(() => vi.fn());
const mockCreateRateLimitHeaders = vi.hoisted(() => vi.fn());
const mockSearchArtist = vi.hoisted(() => vi.fn());
const mockIsAppleMusicAvailable = vi.hoisted(() => vi.fn());

vi.mock('@clerk/nextjs/server', () => ({ auth: mockAuth }));

vi.mock('@/lib/rate-limit', async importOriginal => {
  const actual = await importOriginal<typeof import('@/lib/rate-limit')>();
  return {
    ...actual,
    getClientIP: vi.fn().mockReturnValue('127.0.0.1'),
    createRateLimitHeaders: mockCreateRateLimitHeaders,
    appleMusicSearchLimiter: {
      limit: mockAppleMusicSearchLimiterLimit,
    },
  };
});

vi.mock('@/lib/dsp-enrichment/providers/apple-music', () => ({
  AppleMusicError: class AppleMusicError extends Error {
    statusCode = 500;
  },
  AppleMusicNotConfiguredError: class AppleMusicNotConfiguredError extends Error {},
  extractImageUrls: vi
    .fn()
    .mockReturnValue({ medium: 'https://example.com/image.jpg' }),
  isAppleMusicAvailable: mockIsAppleMusicAvailable,
  searchArtist: mockSearchArtist,
}));

vi.mock('@/lib/dsp-enrichment/circuit-breakers', () => ({
  CircuitOpenError: class CircuitOpenError extends Error {
    stats = {};
  },
}));

import { GET } from '@/app/api/apple-music/search/route';

describe('GET /api/apple-music/search', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuth.mockResolvedValue({ userId: 'user_1' });
    mockIsAppleMusicAvailable.mockReturnValue(true);
    mockCreateRateLimitHeaders.mockReturnValue({
      'X-RateLimit-Limit': '30',
      'X-RateLimit-Remaining': '29',
    });
    mockAppleMusicSearchLimiterLimit.mockResolvedValue({
      success: true,
      limit: 30,
      remaining: 29,
      reset: new Date(Date.now() + 60_000),
    });
    mockSearchArtist.mockResolvedValue([
      {
        id: 'artist_1',
        attributes: {
          name: 'Artist One',
          url: 'https://music.apple.com/artist/artist_1',
          genreNames: ['Pop'],
        },
      },
    ]);
  });

  it('returns 429 when rate limited', async () => {
    mockAppleMusicSearchLimiterLimit.mockResolvedValue({
      success: false,
      limit: 30,
      remaining: 0,
      reset: new Date(Date.now() + 60_000),
    });

    const response = await GET(
      new NextRequest('http://localhost/api/apple-music/search?q=artist')
    );

    expect(response.status).toBe(429);
    expect(response.headers.get('X-RateLimit-Limit')).toBe('30');
    expect(response.headers.get('X-RateLimit-Remaining')).toBe('29');
  });

  it('applies independent limits per user key', async () => {
    mockAuth.mockResolvedValueOnce({ userId: 'user_a' });
    await GET(
      new NextRequest('http://localhost/api/apple-music/search?q=artist')
    );

    mockAuth.mockResolvedValueOnce({ userId: 'user_b' });
    await GET(
      new NextRequest('http://localhost/api/apple-music/search?q=artist')
    );

    expect(mockAppleMusicSearchLimiterLimit).toHaveBeenNthCalledWith(
      1,
      'user:user_a'
    );
    expect(mockAppleMusicSearchLimiterLimit).toHaveBeenNthCalledWith(
      2,
      'user:user_b'
    );
  });
});
