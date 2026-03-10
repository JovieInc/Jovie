import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockAuth = vi.hoisted(() => vi.fn());
const mockCaptureError = vi.hoisted(() => vi.fn());
const mockSelect = vi.hoisted(() => vi.fn());

const profileLimit = vi.hoisted(() => vi.fn());
const jobLimit = vi.hoisted(() => vi.fn());
const matchesWhere = vi.hoisted(() => vi.fn());

vi.mock('@clerk/nextjs/server', () => ({ auth: mockAuth }));

vi.mock('@/lib/error-tracking', () => ({ captureError: mockCaptureError }));

vi.mock('@/lib/db', () => ({
  db: {
    select: mockSelect,
  },
}));

function makeFallbackQuery() {
  return {
    from: () => ({
      innerJoin: () => ({
        where: () => ({
          limit: async () => [],
        }),
      }),
      where: () => ({
        orderBy: () => ({
          limit: async () => [],
        }),
      }),
    }),
  };
}

describe('GET /api/dsp/enrichment/status', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();

    mockAuth.mockResolvedValue({ userId: 'clerk_1' });

    mockSelect.mockImplementation(() => makeFallbackQuery());
    mockSelect
      .mockReturnValueOnce({
        from: () => ({
          innerJoin: () => ({
            where: () => ({
              limit: profileLimit,
            }),
          }),
        }),
      })
      .mockReturnValueOnce({
        from: () => ({
          where: () => ({
            orderBy: () => ({
              limit: jobLimit,
            }),
          }),
        }),
      })
      .mockReturnValueOnce({
        from: () => ({
          where: matchesWhere,
        }),
      });

    profileLimit.mockResolvedValue([{ id: 'profile_1', clerkId: 'clerk_1' }]);
    jobLimit.mockResolvedValue([]);
    matchesWhere.mockResolvedValue([]);
  });

  it('returns null timestamps when no discovery job exists', async () => {
    const { GET } = await import('@/app/api/dsp/enrichment/status/route');

    const response = await GET(
      new NextRequest(
        'http://localhost/api/dsp/enrichment/status?profileId=profile_1'
      )
    );
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.status.discoveryStartedAt).toBeNull();
    expect(data.status.discoveryCompletedAt).toBeNull();
    expect(data.status.enrichmentStartedAt).toBeNull();
    expect(data.status.enrichmentCompletedAt).toBeNull();
  });

  it('uses discovery job timestamps for discovery and enrichment milestones', async () => {
    const createdAt = new Date('2026-01-01T00:00:00.000Z');
    const updatedAt = new Date('2026-01-01T01:00:00.000Z');

    jobLimit.mockResolvedValue([
      {
        id: 'job_1',
        status: 'succeeded',
        createdAt,
        updatedAt,
      },
    ]);

    matchesWhere.mockResolvedValue([
      {
        providerId: 'apple_music',
        status: 'auto_confirmed',
        matchingIsrcCount: 10,
        totalTracksChecked: 10,
        updatedAt,
      },
    ]);

    const { GET } = await import('@/app/api/dsp/enrichment/status/route');

    const response = await GET(
      new NextRequest(
        'http://localhost/api/dsp/enrichment/status?profileId=profile_1'
      )
    );
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.status.discoveryStartedAt).toBe(createdAt.toISOString());
    expect(data.status.discoveryCompletedAt).toBe(updatedAt.toISOString());
    expect(data.status.enrichmentStartedAt).toBe(updatedAt.toISOString());
    expect(data.status.enrichmentCompletedAt).toBe(updatedAt.toISOString());
  });
});
