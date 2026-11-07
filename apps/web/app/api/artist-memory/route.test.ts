import { beforeEach, describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => ({
  getCachedAuth: vi.fn(),
  getAuthenticatedProfile: vi.fn(),
  loadArtistMemory: vi.fn(),
  captureError: vi.fn(),
}));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/auth/cached', () => ({ getCachedAuth: hoisted.getCachedAuth }));
vi.mock('@/lib/db', () => ({ db: {} }));
vi.mock('@/lib/db/queries/shared', () => ({
  getAuthenticatedProfile: hoisted.getAuthenticatedProfile,
}));
vi.mock('@/lib/artist-memory/queries.server', () => ({
  loadArtistMemory: hoisted.loadArtistMemory,
}));
vi.mock('@/lib/error-tracking', () => ({ captureError: hoisted.captureError }));

const PROFILE_ID = '5b0f7a4e-2a51-4b8e-9d43-0d7b2d6a9c11';
const url = (q: string) => new Request(`https://jov.ie/api/artist-memory${q}`);

describe('GET /api/artist-memory', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hoisted.getCachedAuth.mockResolvedValue({ userId: 'owner-1' });
    hoisted.getAuthenticatedProfile.mockResolvedValue({ id: PROFILE_ID });
  });

  it('rejects anonymous callers before reading anything', async () => {
    hoisted.getCachedAuth.mockResolvedValue({ userId: null });
    const { GET } = await import('./route');
    const res = await GET(url(`?profileId=${PROFILE_ID}`));
    expect(res.status).toBe(401);
    expect(hoisted.loadArtistMemory).not.toHaveBeenCalled();
  });

  it('rejects a malformed profile id', async () => {
    const { GET } = await import('./route');
    expect((await GET(url('?profileId=nope'))).status).toBe(400);
  });

  it('hides profiles the caller does not own', async () => {
    hoisted.getAuthenticatedProfile.mockResolvedValue(null);
    const { GET } = await import('./route');
    expect((await GET(url(`?profileId=${PROFILE_ID}`))).status).toBe(404);
    expect(hoisted.loadArtistMemory).not.toHaveBeenCalled();
  });

  it('returns the owner view and the one-tap review queue', async () => {
    const { ARTIST_MEMORY_CONTRACT } = await import(
      '@/lib/artist-memory/contract'
    );
    const base = {
      contract: ARTIST_MEMORY_CONTRACT,
      profileId: PROFILE_ID,
      kind: 'learned',
      label: 'Learned in conversation',
      value: 'x',
      display: 'x',
      provenance: [
        { sourceId: 'jovie.chat', method: 'observation', observedAt: null },
      ],
      visibility: 'private',
      origin: 'conversation',
      updatedAt: '2026-10-29T00:00:00.000Z',
    };
    hoisted.loadArtistMemory.mockResolvedValue([
      {
        ...base,
        id: 'a',
        key: 'artist.learned.a',
        confidence: 0.6,
        review: 'found',
      },
      {
        ...base,
        id: 'b',
        key: 'artist.learned.b',
        confidence: 1,
        review: 'confirmed',
      },
    ]);
    const { GET } = await import('./route');
    const res = await GET(url(`?profileId=${PROFILE_ID}`));
    expect(res.status).toBe(200);
    expect(hoisted.loadArtistMemory).toHaveBeenCalledWith(PROFILE_ID, 'owner');
    const body = await res.json();
    expect(body.facts).toHaveLength(2);
    expect(body.reviewQueue).toEqual(['a']);
  });

  it('fails closed with a 500 and reports the error', async () => {
    hoisted.loadArtistMemory.mockRejectedValue(new Error('db down'));
    const { GET } = await import('./route');
    expect((await GET(url(`?profileId=${PROFILE_ID}`))).status).toBe(500);
    expect(hoisted.captureError).toHaveBeenCalled();
  });
});
