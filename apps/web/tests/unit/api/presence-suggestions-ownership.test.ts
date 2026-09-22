import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GET } from '@/app/api/suggestions/route';

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  select: vi.fn(),
  update: vi.fn(),
  insert: vi.fn(),
  rows: [] as unknown[][],
}));
vi.mock('@/lib/auth/cached', () => ({ getCachedAuth: mocks.auth }));
vi.mock('@/lib/db', () => ({
  db: { select: mocks.select, update: mocks.update, insert: mocks.insert },
}));
vi.mock('@/lib/error-tracking', () => ({
  captureError: vi.fn(),
  captureWarning: vi.fn(),
}));
vi.mock('@/lib/dsp-enrichment/jobs/catalog-scan', () => ({
  processCatalogScanStandalone: vi.fn(),
}));
vi.mock('@/lib/ingestion/jobs', () => ({
  enqueueDspTrackEnrichmentJob: vi.fn(),
}));

const profileId = '11111111-1111-4111-8111-111111111111';
const appUserId = '22222222-2222-4222-8222-222222222222';
const owner = {
  id: profileId,
  userId: appUserId,
  clerkId: 'user_retired',
  avatarLockedByUser: true,
  settings: {},
};
const routes = [
  {
    name: 'DSP confirm',
    load: () => import('@/app/api/dsp/matches/[id]/confirm/route'),
    status: 'suggested',
  },
  {
    name: 'DSP reject',
    load: () => import('@/app/api/dsp/matches/[id]/reject/route'),
    status: 'suggested',
  },
  {
    name: 'social approve',
    load: () => import('@/app/api/suggestions/social-links/[id]/approve/route'),
    status: 'pending',
  },
  {
    name: 'social reject',
    load: () => import('@/app/api/suggestions/social-links/[id]/reject/route'),
    status: 'pending',
  },
];
function request() {
  return new Request('http://localhost/api/suggestions', {
    method: 'POST',
    body: JSON.stringify({ profileId }),
    headers: { 'Content-Type': 'application/json' },
  });
}
const params = { params: Promise.resolve({ id: 'candidate-1' }) };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.rows = [];
  mocks.auth.mockResolvedValue({ userId: appUserId });
  mocks.select.mockImplementation(() => {
    const result = Promise.resolve(mocks.rows.shift() ?? []);
    const chain = {
      from: () => chain,
      where: () => chain,
      orderBy: () => chain,
      limit: () => result,
      then: result.then.bind(result),
    };
    return chain;
  });
  mocks.update.mockReturnValue({
    set: () => ({ where: vi.fn().mockResolvedValue(undefined) }),
  });
  mocks.insert.mockReturnValue({
    values: vi.fn().mockResolvedValue(undefined),
  });
});

describe('Presence suggestions owner authorization', () => {
  it('returns saved suggestions for the app user despite a different retired identity', async () => {
    mocks.rows = [
      [owner],
      [
        {
          id: 'saved',
          providerId: 'spotify',
          externalArtistName: 'Artist',
          confidenceScore: '0.9',
        },
      ],
      [],
      [],
      [{ value: 0 }],
    ];
    const response = await GET(
      new Request(`http://localhost/api/suggestions?profileId=${profileId}`)
    );
    expect(response.status).toBe(200);
    expect((await response.json()).suggestions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'saved', type: 'dsp_match' }),
      ])
    );
  });
  it('rejects another owner even when their retired identity matches the session string', async () => {
    mocks.rows = [[{ ...owner, userId: 'another-owner', clerkId: appUserId }]];
    expect(
      (
        await GET(
          new Request(`http://localhost/api/suggestions?profileId=${profileId}`)
        )
      ).status
    ).toBe(403);
    expect(mocks.select).toHaveBeenCalledTimes(1);
  });
  it('requires a session before querying saved suggestions', async () => {
    mocks.auth.mockResolvedValue({ userId: null });
    expect(
      (
        await GET(
          new Request(`http://localhost/api/suggestions?profileId=${profileId}`)
        )
      ).status
    ).toBe(401);
    expect(mocks.select).not.toHaveBeenCalled();
  });
  for (const route of routes) {
    it(`${route.name} accepts the app owner`, async () => {
      mocks.rows = [
        [owner],
        [
          {
            id: 'candidate-1',
            creatorProfileId: profileId,
            status: route.status,
            platform: 'instagram',
            url: 'https://instagram.com/artist',
            providerId: 'deezer',
            externalArtistId: null,
          },
        ],
      ];
      const { POST } = await route.load();
      expect((await POST(request(), params)).status).toBe(200);
      expect(mocks.update).toHaveBeenCalledTimes(1);
    });
    it(`${route.name} denies another owner before any write`, async () => {
      mocks.rows = [
        [{ ...owner, userId: 'another-owner', clerkId: appUserId }],
      ];
      const { POST } = await route.load();
      expect((await POST(request(), params)).status).toBe(403);
      expect(mocks.update).not.toHaveBeenCalled();
      expect(mocks.insert).not.toHaveBeenCalled();
    });
    it(`${route.name} denies candidates belonging to another profile`, async () => {
      mocks.rows = [
        [owner],
        [
          {
            id: 'candidate-1',
            creatorProfileId: 'another-profile',
            status: route.status,
          },
        ],
      ];
      const { POST } = await route.load();
      expect((await POST(request(), params)).status).toBe(403);
      expect(mocks.update).not.toHaveBeenCalled();
      expect(mocks.insert).not.toHaveBeenCalled();
    });
  }
});
