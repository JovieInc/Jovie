import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GET } from '@/app/s/[code]/route';
import { recordAudienceEvent } from '@/lib/audience/record-audience-event';

const mocks = vi.hoisted(() => {
  const sourceLink = {
    id: 'source_link_123',
    creatorProfileId: 'profile_123',
    code: 'abc123',
    name: 'QR Campaign',
    sourceType: 'qr',
    destinationKind: 'profile',
    destinationId: 'profile_123',
    destinationUrl: 'https://example.com/profile',
    utmParams: {},
    metadata: {},
    archivedAt: null,
  };

  const selectLimitMock = vi.fn().mockResolvedValue([sourceLink]);
  const selectWhereMock = vi.fn().mockReturnValue({ limit: selectLimitMock });
  const selectFromMock = vi.fn().mockReturnValue({ where: selectWhereMock });
  const selectMock = vi.fn().mockReturnValue({ from: selectFromMock });

  const txUpdateWhereMock = vi.fn().mockResolvedValue(undefined);
  const txUpdateSetMock = vi.fn().mockReturnValue({ where: txUpdateWhereMock });
  const txUpdateMock = vi.fn().mockReturnValue({ set: txUpdateSetMock });

  const txInsertReturningMock = vi.fn().mockResolvedValue([
    {
      id: 'audience_member_123',
      tags: [],
      visits: 1,
      engagementScore: 1,
    },
  ]);
  const txInsertOnConflictMock = vi.fn().mockReturnValue({
    returning: txInsertReturningMock,
  });
  const txInsertValuesMock = vi.fn().mockReturnValue({
    onConflictDoNothing: txInsertOnConflictMock,
  });
  const txInsertMock = vi.fn().mockReturnValue({ values: txInsertValuesMock });

  const withSystemIngestionSession = vi
    .fn()
    .mockImplementation(async callback =>
      callback({
        update: txUpdateMock,
        insert: txInsertMock,
      })
    );

  return {
    selectMock,
    selectLimitMock,
    sourceLink,
    txInsertMock,
    withSystemIngestionSession,
    recordAudienceEvent: vi.fn().mockResolvedValue(undefined),
  };
});

vi.mock('@/lib/db', () => ({
  db: {
    select: mocks.selectMock,
  },
}));

vi.mock('@/lib/db/schema/analytics', () => ({
  audienceMembers: {
    id: 'id',
    creatorProfileId: 'creatorProfileId',
    fingerprint: 'fingerprint',
    tags: 'tags',
    visits: 'visits',
    engagementScore: 'engagementScore',
  },
  audienceSourceLinks: {
    id: 'id',
    code: 'code',
    scanCount: 'scanCount',
  },
}));

vi.mock('drizzle-orm', () => ({
  and: vi.fn(),
  eq: vi.fn(),
  sql: vi.fn().mockReturnValue('sql'),
}));

vi.mock('@/lib/ingestion/session', () => ({
  withSystemIngestionSession: mocks.withSystemIngestionSession,
}));

vi.mock('@/lib/audience/record-audience-event', () => ({
  recordAudienceEvent: mocks.recordAudienceEvent,
}));

vi.mock('@/app/api/audience/lib/audience-utils', () => ({
  createFingerprint: vi.fn().mockReturnValue('fingerprint'),
  mergeAudienceTags: vi
    .fn()
    .mockImplementation((existing, next) => [
      ...(existing ?? []),
      ...(next ?? []),
    ]),
}));

vi.mock('@/lib/rate-limit', () => ({
  publicClickLimiter: {
    limit: vi.fn().mockResolvedValue({ success: true }),
  },
}));

vi.mock('@/lib/utils/bot-detection', () => ({
  detectBot: vi.fn().mockReturnValue({ isBot: false }),
}));

vi.mock('@/lib/utils/ip-extraction', () => ({
  extractClientIP: vi.fn().mockReturnValue('203.0.113.1'),
}));

vi.mock('@/lib/utils/url-validation', () => ({
  validateSocialLinkUrl: vi.fn().mockReturnValue({ valid: true }),
}));

vi.mock('@/lib/error-tracking', () => ({
  captureError: vi.fn().mockResolvedValue(undefined),
}));

describe('GET /s/[code]', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.selectLimitMock.mockResolvedValue([mocks.sourceLink]);
  });

  it('treats partial consent cookies as malformed through the shared parser', async () => {
    const request = new NextRequest('http://localhost/s/abc123', {
      headers: {
        Cookie: 'jv_cc={"marketing":false}',
      },
    });

    const response = await GET(request, {
      params: Promise.resolve({ code: 'abc123' }),
    });

    expect(response.status).toBe(302);
    expect(response.headers.get('location')).toBe(
      'https://example.com/profile'
    );
    expect(mocks.txInsertMock).toHaveBeenCalledTimes(1);
    expect(recordAudienceEvent).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        audienceMemberId: 'audience_member_123',
        eventType: 'source_scanned',
      })
    );
  });

  it.each([
    ['absent consent cookie', 'jv_cc_required=1'],
    ['malformed consent cookie', 'jv_cc_required=1; jv_cc=not-json'],
  ])('skips audience recording in consent-required regions with %s', async (_caseName, cookieHeader) => {
    const request = new NextRequest('http://localhost/s/abc123', {
      headers: {
        Cookie: cookieHeader,
      },
    });

    const response = await GET(request, {
      params: Promise.resolve({ code: 'abc123' }),
    });

    expect(response.status).toBe(302);
    expect(response.headers.get('location')).toBe(
      'https://example.com/profile'
    );
    expect(mocks.txInsertMock).not.toHaveBeenCalled();
    expect(recordAudienceEvent).not.toHaveBeenCalled();
  });
});
