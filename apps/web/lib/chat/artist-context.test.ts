import { beforeEach, describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => ({
  results: [] as unknown[][],
  access: vi.fn(),
  views: vi.fn(),
  listenCount: vi.fn(),
}));

function builder(rows: unknown[]) {
  const chain: Record<string, unknown> = {
    from: () => chain,
    where: () => chain,
    limit: () => Promise.resolve(rows),
    then: (
      onFulfilled: (value: unknown[]) => unknown,
      onRejected?: (reason: unknown) => unknown
    ) => Promise.resolve(rows).then(onFulfilled, onRejected),
  };
  return chain;
}

vi.mock('@/lib/db', () => ({
  db: { select: () => builder(hoisted.results.shift() ?? []) },
}));
vi.mock('@/lib/auth/profile-access', () => ({
  getExactProfileAccess: hoisted.access,
}));
vi.mock('@/lib/analytics/authorized-read', () => ({
  readAuthorizedProfileViews: hoisted.views,
}));
vi.mock('@/lib/chat/release-listen-links', () => ({
  countVisibleReleaseListenLinks: hoisted.listenCount,
}));
vi.mock('@/lib/utils/logger', () => ({
  logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { fetchArtistContext } from '@/lib/chat/artist-context';

const PROFILE = {
  displayName: null,
  username: 'timwhite',
  bio: 'bio',
  genres: null,
  spotifyFollowers: 10,
  spotifyPopularity: 20,
  spotifyUrl: null,
  appleMusicUrl: null,
};

describe('fetchArtistContext', () => {
  beforeEach(() => {
    hoisted.results = [];
    hoisted.access.mockResolvedValue({ ok: true });
    hoisted.views.mockResolvedValue(42);
    hoisted.listenCount.mockResolvedValue(0);
  });

  it('returns null without querying the profile when access is denied', async () => {
    hoisted.access.mockResolvedValue({ ok: false, reason: 'denied' });
    await expect(fetchArtistContext('p1', 'u1')).resolves.toBeNull();
    expect(hoisted.views).not.toHaveBeenCalled();
  });

  it('returns null when the profile row is missing', async () => {
    hoisted.results = [[]];
    await expect(fetchArtistContext('p1', 'u1')).resolves.toBeNull();
  });

  it('assembles links, tips and authorized views into the chat context', async () => {
    hoisted.results = [
      [PROFILE],
      [{ totalActive: 3, musicActive: 1 }],
      [{ totalReceived: 500, monthReceived: 200, tipsSubmitted: 2 }],
      [{ total: 7 }],
    ];

    const context = await fetchArtistContext('p1', 'u1');

    expect(context).toMatchObject({
      displayName: 'timwhite',
      username: 'timwhite',
      genres: [],
      profileViews: 42,
      hasSocialLinks: true,
      hasMusicLinks: true,
      tippingStats: {
        tipClicks: 7,
        tipsSubmitted: 2,
        totalReceivedCents: 500,
        monthReceivedCents: 200,
      },
    });
    expect(hoisted.views).toHaveBeenCalledWith('u1');
  });

  it('falls back to zero views when authorized analytics fail', async () => {
    hoisted.views.mockRejectedValue(new Error('analytics down'));
    hoisted.results = [[PROFILE], [], [], []];

    const context = await fetchArtistContext('p1', 'u1');

    expect(context?.profileViews).toBe(0);
    expect(context?.hasSocialLinks).toBe(false);
    expect(context?.tippingStats.tipClicks).toBe(0);
  });
});
