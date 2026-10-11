import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AudienceSourceLink } from '@/lib/db/schema/analytics';
import type { SocialLink } from '@/lib/db/schema/links';
import type { ReleaseViewModel } from '@/lib/discography/types';
import type { ReleaseProfileContext } from '@/lib/releases/release-types';

const { dbSelectMock, loadReleaseMatrixMock, captureErrorMock } = vi.hoisted(
  () => ({
    dbSelectMock: vi.fn(),
    loadReleaseMatrixMock: vi.fn(),
    captureErrorMock: vi.fn(),
  })
);

vi.mock('drizzle-orm', () => ({
  and: vi.fn((...args: unknown[]) => args),
  desc: vi.fn((column: unknown) => column),
  eq: vi.fn((a: unknown, b: unknown) => [a, b]),
}));

vi.mock('@/lib/db', () => ({
  db: { select: dbSelectMock },
}));

vi.mock('@/lib/db/schema/analytics', () => ({
  audienceSourceLinks: {
    creatorProfileId: 'creatorProfileId',
    sourceGroupId: 'sourceGroupId',
    createdAt: 'createdAt',
  },
  audienceSourceGroups: {
    id: 'id',
    name: 'name',
  },
}));

vi.mock('@/lib/db/schema/links', () => ({
  socialLinks: {
    creatorProfileId: 'creatorProfileId',
    state: 'state',
    isActive: 'isActive',
    createdAt: 'createdAt',
  },
}));

vi.mock('@/lib/releases/release-matrix-loader', () => ({
  loadReleaseMatrixForProfile: loadReleaseMatrixMock,
}));

vi.mock('@/lib/error-tracking', () => ({
  captureError: captureErrorMock,
}));

vi.mock('@/constants/domains', () => ({
  BASE_URL: 'https://jov.ie',
  getProfileUrl: (handle: string) => `https://jov.ie/${handle}`,
}));

import { loadLinksWorkspaceData } from '@/app/app/(shell)/links/links-data';

function resolvedQuery<T>(value: T) {
  const promise = Promise.resolve(value);
  const chain: Record<string, unknown> = {};
  const self = () => chain;
  for (const method of ['from', 'leftJoin', 'where', 'orderBy', 'limit']) {
    chain[method] = self;
  }
  chain.then = promise.then.bind(promise);
  chain.catch = promise.catch.bind(promise);
  chain.finally = promise.finally.bind(promise);
  return chain;
}

function rejectedQuery(error: unknown) {
  const promise = Promise.reject(error);
  const chain: Record<string, unknown> = {};
  const self = () => chain;
  for (const method of ['from', 'leftJoin', 'where', 'orderBy', 'limit']) {
    chain[method] = self;
  }
  chain.then = promise.then.bind(promise);
  chain.catch = promise.catch.bind(promise);
  chain.finally = promise.finally.bind(promise);
  return chain;
}

const sourceLink = {
  id: 'link-1',
  creatorProfileId: 'profile-1',
  sourceGroupId: 'group-1',
  code: 'tour-abc12345',
  name: 'Fall tour poster',
  sourceType: 'qr',
  destinationKind: 'release',
  destinationId: 'release-9',
  destinationUrl: 'https://jov.ie/tim/album',
  utmParams: { source: 'qr_code' },
  metadata: {},
  scanCount: 42,
  lastScannedAt: null,
  archivedAt: null,
  createdAt: new Date('2026-09-01T00:00:00Z'),
  updatedAt: new Date('2026-09-01T00:00:00Z'),
} as AudienceSourceLink;

const socialLink = {
  id: 'social-1',
  creatorProfileId: 'profile-1',
  platform: 'instagram',
  platformType: 'social',
  url: 'https://instagram.com/tim',
  displayText: null,
  sortOrder: 0,
  clicks: 12,
  isActive: true,
  state: 'active',
  createdAt: new Date('2026-08-01T00:00:00Z'),
  updatedAt: new Date('2026-08-01T00:00:00Z'),
} as SocialLink;

const release = {
  profileId: 'profile-1',
  id: 'release-9',
  title: 'Midnight City',
  status: 'released',
  slug: 'midnight-city',
  smartLinkPath: '/tim/midnight-city',
  providers: [],
  releaseType: 'single',
  isExplicit: false,
  totalTracks: 1,
  weeklyStreams: 17,
} as unknown as ReleaseViewModel;

const input = {
  profileId: 'profile-1',
  profileHandle: 'tim',
  profileTitle: 'Tim White',
  releaseProfileContext: {
    userId: 'user-1',
    profileId: 'profile-1',
    profileHandle: 'tim',
  } as ReleaseProfileContext,
  route: '/app/links',
};

function mockHealthyLoaders() {
  dbSelectMock
    .mockReturnValueOnce(
      resolvedQuery([{ link: sourceLink, groupName: 'Fall Tour' }])
    )
    .mockReturnValueOnce(resolvedQuery([socialLink]));
  loadReleaseMatrixMock.mockResolvedValue([release]);
}

describe('loadLinksWorkspaceData', () => {
  beforeEach(() => {
    dbSelectMock.mockReset();
    loadReleaseMatrixMock.mockReset();
    captureErrorMock.mockReset();
  });

  it('composes profile, release, source, and social link rows', async () => {
    mockHealthyLoaders();

    const { rows, loadFailed } = await loadLinksWorkspaceData(input);

    expect(loadFailed).toBe(false);
    expect(rows.map(row => row.id)).toEqual([
      'profile',
      'release-release-9',
      'source-link-1',
      'social-social-1',
    ]);
    expect(rows[0]).toMatchObject({
      jovieUrl: 'https://jov.ie/tim',
      title: 'Tim White',
      clicks: 12,
    });
    expect(loadReleaseMatrixMock).toHaveBeenCalledWith(
      input.releaseProfileContext
    );
  });

  it('drops only the failed family when source links fail', async () => {
    dbSelectMock
      .mockReturnValueOnce(rejectedQuery(new Error('source db down')))
      .mockReturnValueOnce(resolvedQuery([socialLink]));
    loadReleaseMatrixMock.mockResolvedValue([release]);

    const { rows, loadFailed } = await loadLinksWorkspaceData(input);

    expect(loadFailed).toBe(true);
    expect(rows.map(row => row.id)).toEqual([
      'profile',
      'release-release-9',
      'social-social-1',
    ]);
    expect(captureErrorMock).toHaveBeenCalledWith(
      'Links workspace source links load failed',
      expect.any(Error),
      { route: '/app/links', profileId: 'profile-1' }
    );
  });

  it('drops only the failed family when social links fail', async () => {
    dbSelectMock
      .mockReturnValueOnce(
        resolvedQuery([{ link: sourceLink, groupName: 'Fall Tour' }])
      )
      .mockReturnValueOnce(rejectedQuery(new Error('social db down')));
    loadReleaseMatrixMock.mockResolvedValue([]);

    const { rows, loadFailed } = await loadLinksWorkspaceData(input);

    expect(loadFailed).toBe(true);
    expect(rows.map(row => row.id)).toEqual(['profile', 'source-link-1']);
    expect(rows.find(row => row.id === 'profile')?.clicks).toBeNull();
    expect(captureErrorMock).toHaveBeenCalledWith(
      'Links workspace social links load failed',
      expect.any(Error),
      { route: '/app/links', profileId: 'profile-1' }
    );
  });

  it('drops only releases when the release matrix load fails', async () => {
    dbSelectMock
      .mockReturnValueOnce(resolvedQuery([]))
      .mockReturnValueOnce(resolvedQuery([]));
    loadReleaseMatrixMock.mockRejectedValue(new Error('release matrix down'));

    const { rows, loadFailed } = await loadLinksWorkspaceData(input);

    expect(loadFailed).toBe(true);
    expect(rows.map(row => row.id)).toEqual(['profile']);
    expect(captureErrorMock).toHaveBeenCalledWith(
      'Links workspace releases load failed',
      expect.any(Error),
      { route: '/app/links', profileId: 'profile-1' }
    );
  });
});
