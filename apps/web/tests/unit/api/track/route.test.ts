import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { POST } from '@/app/api/track/route';
import { recordAudienceEvent } from '@/lib/audience/record-audience-event';
import { captureError } from '@/lib/error-tracking';

const hoisted = vi.hoisted(() => {
  const selectLimitMock = vi.fn().mockResolvedValue([{ id: 'profile_123' }]);
  const selectWhereMock = vi.fn().mockReturnValue({
    limit: selectLimitMock,
  });
  const selectFromMock = vi.fn().mockReturnValue({
    where: selectWhereMock,
  });
  const selectMock = vi.fn().mockReturnValue({
    from: selectFromMock,
  });

  const updateError = new Error('social link update failed');
  const updateWhereMock = vi.fn().mockRejectedValue(updateError);
  const updateSetMock = vi.fn().mockReturnValue({
    where: updateWhereMock,
  });
  const updateMock = vi.fn().mockReturnValue({
    set: updateSetMock,
  });

  const withSystemIngestionSession = vi
    .fn()
    .mockImplementation(async callback =>
      callback({
        insert: vi.fn().mockReturnValue({
          values: vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue([{ id: 'click_event_123' }]),
          }),
        }),
      })
    );

  return {
    selectMock,
    selectWhereMock,
    selectFromMock,
    selectLimitMock,
    updateMock,
    updateSetMock,
    updateWhereMock,
    updateError,
    withSystemIngestionSession,
    recordAudienceEvent: vi.fn().mockResolvedValue(undefined),
  };
});

vi.mock('@/lib/db', () => ({
  db: {
    select: hoisted.selectMock,
    update: hoisted.updateMock,
  },
}));

vi.mock('@/lib/db/schema', () => ({
  creatorProfiles: { id: 'id', usernameNormalized: 'usernameNormalized' },
  socialLinks: { id: 'id', clicks: 'clicks' },
  audienceMembers: {},
  clickEvents: { id: 'id' },
}));

vi.mock('drizzle-orm', () => ({
  and: vi.fn(),
  eq: vi.fn(),
  sql: vi.fn(),
}));

vi.mock('@/lib/ingestion/session', () => ({
  withSystemIngestionSession: hoisted.withSystemIngestionSession,
}));

vi.mock('@/lib/audience/record-audience-event', () => ({
  recordAudienceEvent: hoisted.recordAudienceEvent,
}));

vi.mock('@/lib/error-tracking', () => ({
  captureError: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/lib/utils', () => ({
  detectPlatformFromUA: vi.fn().mockReturnValue('mobile'),
}));

vi.mock('@/lib/utils/ip-extraction', () => ({
  extractClientIP: vi.fn().mockReturnValue('203.0.113.1'),
}));

vi.mock('../../../../app/api/audience/lib/audience-utils', () => ({
  createFingerprint: vi.fn().mockReturnValue('fingerprint'),
  deriveIntentLevel: vi.fn().mockReturnValue('medium'),
  getActionWeight: vi.fn().mockReturnValue(1),
  mergeAudienceTags: vi
    .fn()
    .mockImplementation(
      (
        existingTags: string[] | null | undefined,
        nextTags: string[] | null | undefined
      ) => [...(existingTags ?? []), ...(nextTags ?? [])]
    ),
  trimHistory: vi.fn().mockReturnValue([]),
}));

describe('POST /api/track', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 400 when the request body is empty', async () => {
    const request = new NextRequest('http://localhost/api/track', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    const response = await POST(request as unknown as NextRequest);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe('Invalid JSON');
  });

  it('logs errors when social link click updates fail', async () => {
    const request = new NextRequest('http://localhost/api/track', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: 'jv_cc={"essential":true,"analytics":false,"marketing":false}',
      },
      body: JSON.stringify({
        handle: 'artist123',
        linkType: 'social',
        target: 'https://example.com',
        linkId: 'link_abc123',
      }),
    });

    const response = await POST(request as unknown as NextRequest);

    expect(response.status).toBe(200);

    await Promise.resolve();
    await Promise.resolve();

    expect(captureError).toHaveBeenCalledWith(
      'Failed to update social link click count',
      hoisted.updateError,
      expect.objectContaining({
        route: '/api/track',
        creatorProfileId: 'profile_123',
        handle: 'artist123',
        linkId: 'link_abc123',
        linkType: 'social',
      })
    );
  });

  it('records a human-readable source label for tracked audience events', async () => {
    hoisted.withSystemIngestionSession.mockImplementationOnce(async callback =>
      callback({
        insert: vi
          .fn()
          .mockReturnValueOnce({
            values: vi.fn().mockReturnValue({
              onConflictDoNothing: vi.fn().mockReturnValue({
                returning: vi.fn().mockResolvedValue([
                  {
                    id: 'audience_member_123',
                    visits: 0,
                    engagementScore: 0,
                    latestActions: [],
                    geoCity: null,
                    geoCountry: null,
                    deviceType: 'mobile',
                    spotifyConnected: false,
                    attributionSource: null,
                    tags: [],
                  },
                ]),
              }),
            }),
          })
          .mockReturnValueOnce({
            values: vi.fn().mockReturnValue({
              returning: vi.fn().mockResolvedValue([{ id: 'click_event_123' }]),
            }),
          }),
        select: vi.fn().mockReturnValue({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue([]),
            }),
          }),
        }),
        update: vi.fn().mockReturnValue({
          set: vi.fn().mockReturnValue({
            where: vi.fn().mockResolvedValue(undefined),
          }),
        }),
      })
    );

    const request = new NextRequest('http://localhost/api/track', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: 'jv_cc={"essential":true,"analytics":true,"marketing":true}',
      },
      body: JSON.stringify({
        handle: 'artist123',
        linkType: 'other',
        target: 'https://example.com',
        source: 'qr',
      }),
    });

    const response = await POST(request as unknown as NextRequest);

    expect(response.status).toBe(200);
    expect(recordAudienceEvent).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        sourceLabel: 'QR Code',
      })
    );
  });
});
