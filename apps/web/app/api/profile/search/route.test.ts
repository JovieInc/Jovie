import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  candidates: vi.fn(),
  limit: vi.fn(),
  captureError: vi.fn(),
}));
vi.mock('@/lib/db', () => ({
  db: {
    select: () => ({
      from: () => ({
        leftJoin: () => ({
          where: () => ({ orderBy: () => ({ limit: mocks.candidates }) }),
        }),
      }),
    }),
  },
}));
vi.mock('@/lib/rate-limit', () => ({
  getClientIP: () => '127.0.0.1',
  publicArtistApiLimiter: { limit: mocks.limit },
  createRateLimitHeaders: () => ({ 'Retry-After': '60' }),
}));
vi.mock('@/lib/error-tracking', () => ({ captureError: mocks.captureError }));

import { GET } from './route';

const publicProfile = {
  username: 'alex-example',
  displayName: 'Alex Example',
  isPublic: true,
  settings: {},
  ownerEmail: null,
};
const request = (q: string) =>
  new Request(`https://jov.ie/api/profile/search?q=${encodeURIComponent(q)}`);

beforeEach(() => {
  vi.clearAllMocks();
  mocks.limit.mockResolvedValue({ success: true });
  mocks.candidates.mockResolvedValue([publicProfile]);
});

describe('public homepage discovery boundary', () => {
  it('returns only public display fields, without owner, settings or identifiers', async () => {
    const response = await GET(request('Alex'));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      profiles: [{ username: 'alex-example', name: 'Alex Example' }],
    });
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(mocks.candidates).toHaveBeenCalledWith(30);
  });

  it('excludes private, unlisted and placeholder identities using the canonical policy', async () => {
    mocks.candidates.mockResolvedValue([
      publicProfile,
      { ...publicProfile, username: 'private', isPublic: false },
      { ...publicProfile, username: 'hidden', settings: { searchable: false } },
      { ...publicProfile, username: 'placeholder', displayName: 'placeholder' },
      { ...publicProfile, username: 'empty', displayName: '' },
    ]);
    const response = await GET(request('Alex'));
    expect((await response.json()).profiles).toEqual([
      { username: 'alex-example', name: 'Alex Example' },
    ]);
  });

  it.each(['', 'x', 'x'.repeat(81)])(
    'rejects invalid query %s before reading data',
    async q => {
      const response = await GET(request(q));
      expect(response.status).toBe(400);
      expect(mocks.candidates).not.toHaveBeenCalled();
    }
  );

  it.each([
    { unavailable: false, status: 429 },
    { unavailable: true, status: 503 },
  ])(
    'fails closed when rate limiting rejects a request',
    async ({ unavailable, status }) => {
      mocks.limit.mockResolvedValue({
        success: false,
        reason: unavailable ? 'temporarily unavailable' : 'limit',
      });
      expect((await GET(request('Alex'))).status).toBe(status);
      expect(mocks.candidates).not.toHaveBeenCalled();
    }
  );

  it('limits results to five eligible public identities', async () => {
    mocks.candidates.mockResolvedValue(
      Array.from({ length: 12 }, (_, index) => ({
        ...publicProfile,
        username: `person-${index}`,
      }))
    );
    expect((await (await GET(request('Alex'))).json()).profiles).toHaveLength(
      5
    );
  });

  it('reports an outage as unavailable, without returning a success-shaped empty list', async () => {
    mocks.candidates.mockRejectedValue(new Error('database unavailable'));
    const response = await GET(request('Alex'));
    expect(response.status).toBe(503);
    expect(await response.json()).not.toHaveProperty('profiles');
    expect(mocks.captureError).toHaveBeenCalledOnce();
  });
});
