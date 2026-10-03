import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  creator: vi.fn(),
  content: vi.fn(),
  entitlements: vi.fn(),
  landing: vi.fn(() => null),
  mystery: vi.fn(() => null),
  scheduled: vi.fn(() => null),
  unreleased: vi.fn(() => null),
  video: vi.fn(() => null),
  preferred: vi.fn(() => null),
  promo: vi.fn(),
}));
vi.mock('./_lib/data', () => ({
  getCreatorByUsername: mocks.creator,
  getContentBySlug: mocks.content,
  getFeaturedSmartLinkStaticParams: vi.fn(),
  getReleaseTrackList: vi.fn(async () => []),
  getUnpublishedReleasePresence: vi.fn(),
  checkPromoDownloads: mocks.promo,
}));
vi.mock('@/lib/profile/opaque-internal-profile-handle.server', () => ({
  resolveOpaqueInternalProfileUsername: vi.fn(async () => ({
    action: 'serve',
  })),
}));
vi.mock('@/lib/entity/queries', () => ({
  getArtistEntitySameAs: vi.fn(async () => []),
}));
vi.mock('@/lib/entitlements/creator-plan', () => ({
  getCreatorEntitlements: mocks.entitlements,
}));
vi.mock('@/app/r/[slug]/ReleaseLandingPage', () => ({
  ReleaseLandingPage: mocks.landing,
}));
vi.mock('@/features/release', () => ({
  MysteryReleasePage: mocks.mystery,
  ScheduledReleasePage: mocks.scheduled,
  UnreleasedReleaseHero: mocks.unreleased,
  VideoReleasePage: mocks.video,
}));
vi.mock('./PreferredDspRedirect', () => ({
  PreferredDspRedirect: mocks.preferred,
}));

import Page from './page';

const creator = {
  id: 'creator-1',
  userId: 'user-1',
  username: 'testartist',
  usernameNormalized: 'testartist',
  displayName: 'Owner',
  avatarUrl: null,
  isClaimed: false,
  settings: { allowArtworkDownloads: true },
};
const content = {
  id: 'release-1',
  type: 'release',
  slug: 'album',
  title: 'Album',
  artworkUrl: 'https://example.com/art.jpg',
  releaseDate: new Date('2026-01-01'),
  revealDate: null,
  providerLinks: [
    { providerId: 'spotify', url: 'https://open.spotify.com/album/1' },
    { providerId: 'tiktok_sound', url: 'https://tiktok.com/song/1' },
  ],
};
async function renderPage() {
  return renderToStaticMarkup(
    await Page({
      params: Promise.resolve({ username: 'testartist', slug: 'album' }),
    })
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.creator.mockResolvedValue(creator);
  mocks.content.mockResolvedValue(content);
  mocks.promo.mockResolvedValue('/testartist/album/download');
  mocks.entitlements.mockResolvedValue({
    entitlements: { booleans: { canAccessFutureReleases: false } },
  });
});

describe('release rendering by publication phase', () => {
  it('renders canonical artist credits, claim controls and provider destinations for released content', async () => {
    const primary = {
      artistId: 'artist-1',
      name: 'Primary Artist',
      handle: 'primaryartist',
      role: 'main_artist',
      position: 0,
    };
    mocks.content.mockResolvedValue({
      ...content,
      primaryArtists: [primary],
      credits: [
        {
          role: 'featured_artist',
          entries: [
            primary,
            {
              artistId: 'artist-2',
              name: 'Guest',
              handle: 'guest',
              role: 'featured_artist',
              position: 1,
            },
          ],
        },
      ],
    });
    await renderPage();
    expect(mocks.landing).toHaveBeenCalledWith(
      expect.objectContaining({
        release: expect.objectContaining({ title: 'Album' }),
        primaryArtists: [expect.objectContaining({ name: 'Primary Artist' })],
        featuredArtists: [{ name: 'Guest', handle: 'guest' }],
        claimBanner: { profileId: 'creator-1', username: 'testartist' },
        allowDownloads: true,
        soundsUrl: '/testartist/album/sounds',
        downloadUrl: '/testartist/album/download',
        tracking: {
          contentType: 'release',
          contentId: 'release-1',
          smartLinkSlug: 'album',
        },
        providers: expect.arrayContaining([
          expect.objectContaining({
            key: 'spotify',
            url: 'https://open.spotify.com/album/1',
          }),
        ]),
      }),
      undefined
    );
    expect(mocks.preferred).toHaveBeenCalled();
    expect(mocks.entitlements).not.toHaveBeenCalled();
  });

  it('shows a scheduled page without downloads or DSP redirect when future access is unavailable', async () => {
    mocks.content.mockResolvedValue({
      ...content,
      releaseDate: new Date('2099-01-01'),
    });
    await renderPage();
    expect(mocks.scheduled).toHaveBeenCalledWith(
      expect.objectContaining({
        release: expect.objectContaining({
          releaseDate: '2099-01-01T00:00:00.000Z',
        }),
      }),
      undefined
    );
    expect(mocks.landing).not.toHaveBeenCalled();
    expect(mocks.preferred).not.toHaveBeenCalled();
    expect(mocks.promo).not.toHaveBeenCalled();
  });

  it('shows the unreleased hero only when the creator is entitled', async () => {
    mocks.content.mockResolvedValue({
      ...content,
      releaseDate: new Date('2099-01-01'),
    });
    mocks.entitlements.mockResolvedValue({
      entitlements: { booleans: { canAccessFutureReleases: true } },
    });
    await renderPage();
    expect(mocks.unreleased).toHaveBeenCalledWith(
      expect.objectContaining({
        release: expect.objectContaining({
          slug: content.slug,
          title: content.title,
        }),
      }),
      undefined
    );
    expect(mocks.scheduled).not.toHaveBeenCalled();
    expect(mocks.preferred).not.toHaveBeenCalled();
  });

  it('keeps unrevealed release details out of the mystery presentation', async () => {
    mocks.content.mockResolvedValue({
      ...content,
      releaseDate: new Date('2099-02-01'),
      revealDate: new Date('2099-01-01'),
    });
    await renderPage();
    expect(mocks.mystery).toHaveBeenCalledWith(
      {
        revealDate: new Date('2099-01-01'),
        artist: {
          id: 'creator-1',
          name: 'Owner',
          handle: 'testartist',
          avatarUrl: null,
        },
        minimal: true,
      },
      undefined
    );
    expect(mocks.landing).not.toHaveBeenCalled();
    expect(mocks.unreleased).not.toHaveBeenCalled();
  });

  it('renders a music video with its canonical destination and falls back for incomplete video metadata', async () => {
    mocks.content.mockResolvedValue({
      ...content,
      releaseType: 'music_video',
      metadata: { youtubeVideoId: 'video-1' },
    });
    await renderPage();
    expect(mocks.video).toHaveBeenCalledWith(
      expect.objectContaining({
        videoId: 'video-1',
        youtubeUrl: 'https://www.youtube.com/watch?v=video-1',
        artist: expect.objectContaining({ ownerUserId: 'user-1' }),
      }),
      undefined
    );
    expect(mocks.landing).not.toHaveBeenCalled();
    mocks.content.mockResolvedValue({
      ...content,
      releaseType: 'music_video',
      metadata: {},
    });
    await renderPage();
    expect(mocks.landing).toHaveBeenCalled();
  });
});
