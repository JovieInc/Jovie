import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => ({
  buildAudienceSourceUtmParams: vi.fn().mockReturnValue({
    source: 'qr_code',
    medium: 'print',
    campaign: 'tour-flyers',
    content: 'london-o2-arena',
  }),
  parseAudienceSourcePayload: vi.fn(),
  resolveAudienceSourceDestinationUrl: vi
    .fn()
    .mockResolvedValue('https://jov.ie/dualipa'),
  withAudienceSourceShortLink: vi.fn().mockImplementation(link => ({
    ...link,
    shortUrl: `https://jov.ie/s/${link.code}`,
  })),
  verifyProfileOwnership: vi.fn().mockResolvedValue({ id: 'profile_123' }),
  createUniqueSourceLinkCode: vi.fn().mockResolvedValue('tour-london-1234'),
  captureError: vi.fn().mockResolvedValue(undefined),
  withDbSessionTx: vi.fn(),
}));

vi.mock('@/lib/auth/session', () => ({
  withDbSessionTx: hoisted.withDbSessionTx,
}));

vi.mock('@/lib/db/queries/shared', () => ({
  verifyProfileOwnership: hoisted.verifyProfileOwnership,
}));

vi.mock('@/lib/audience/source-links', () => ({
  createUniqueSourceLinkCode: hoisted.createUniqueSourceLinkCode,
}));

vi.mock('@/lib/error-tracking', () => ({
  captureError: hoisted.captureError,
}));

vi.mock('../source-route-helpers', () => ({
  AUDIENCE_SOURCE_PAGE_SIZE: 100,
  NO_STORE_HEADERS: { 'Cache-Control': 'no-store' },
  buildAudienceSourceErrorResponse: (error: string, status: number) =>
    Response.json({ error }, { status }),
  buildAudienceSourceUtmParams: hoisted.buildAudienceSourceUtmParams,
  parseAudienceSourcePayload: hoisted.parseAudienceSourcePayload,
  resolveAudienceSourceDestinationUrl:
    hoisted.resolveAudienceSourceDestinationUrl,
  withAudienceSourceShortLink: hoisted.withAudienceSourceShortLink,
}));

vi.mock('@/lib/db/schema/analytics', () => ({
  audienceSourceGroups: {
    id: 'id',
    creatorProfileId: 'creator_profile_id',
    name: 'name',
    archivedAt: 'archived_at',
  },
  audienceSourceLinks: {
    id: 'id',
    creatorProfileId: 'creator_profile_id',
    code: 'code',
    createdAt: 'created_at',
    archivedAt: 'archived_at',
  },
}));

vi.mock('drizzle-orm', () => ({
  and: vi.fn(),
  desc: vi.fn(),
  eq: vi.fn(),
  isNull: vi.fn(),
}));

const { POST } = await import('./route');

describe('POST /api/dashboard/audience/source-links', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hoisted.parseAudienceSourcePayload.mockResolvedValue({
      data: {
        profileId: '123e4567-e89b-12d3-a456-426614174000',
        sourceGroupId: '123e4567-e89b-12d3-a456-426614174001',
        name: 'London O2 Arena',
        sourceType: 'qr',
        destinationKind: 'profile',
        destinationId: undefined,
        destinationUrl: undefined,
      },
    });

    hoisted.withDbSessionTx.mockImplementation(async callback =>
      callback(
        {
          select: vi.fn().mockReturnValue({
            from: vi.fn().mockReturnValue({
              where: vi.fn().mockReturnValue({
                limit: vi.fn().mockResolvedValue([
                  {
                    id: 'group_123',
                    name: 'Tour Flyers',
                  },
                ]),
              }),
            }),
          }),
          insert: vi.fn().mockReturnValue({
            values: vi.fn().mockReturnValue({
              returning: vi.fn().mockResolvedValue([
                {
                  id: 'link_123',
                  code: 'tour-london-1234',
                  name: 'London O2 Arena',
                },
              ]),
            }),
          }),
        },
        'clerk_123'
      )
    );
  });

  it('uses the source group name for campaign UTM params', async () => {
    const request = new NextRequest(
      'http://localhost/api/dashboard/audience/source-links',
      { method: 'POST' }
    );

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(201);
    expect(data.link.shortUrl).toBe('https://jov.ie/s/tour-london-1234');
    expect(hoisted.buildAudienceSourceUtmParams).toHaveBeenCalledWith(
      'Tour Flyers',
      'London O2 Arena',
      {
        source: 'qr_code',
        medium: 'print',
      }
    );
  });
});
