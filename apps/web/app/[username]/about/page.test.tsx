/**
 * Regression: screenshot CI's noop database has no `unfazed` row, and the
 * about route used to call notFound() for that reserved capture profile.
 * The profile root already renders the fixture without a lookup. This page
 * must do the same, and a real missing profile must still 404.
 */

import { createElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PublicProfileLoaderResult } from '@/app/[username]/_lib/public-profile-loader';
import AboutPage, { generateMetadata } from '@/app/[username]/about/page';

const { getProfileAndLinksMock, notFoundMock } = vi.hoisted(() => ({
  getProfileAndLinksMock: vi.fn(),
  notFoundMock: vi.fn(() => {
    throw new Error('NEXT_NOT_FOUND');
  }),
}));

vi.mock('server-only', () => ({}));

vi.mock('next/navigation', () => ({
  notFound: notFoundMock,
}));

vi.mock('@/app/[username]/_lib/public-profile-loader', () => ({
  getProfileAndLinks: (...args: unknown[]) => getProfileAndLinksMock(...args),
}));

const {
  getCreditedArtistsWithProfilesMock,
  getStructuredReleaseCollaboratorsMock,
  getReleasesForProfileLiteMock,
} = vi.hoisted(() => ({
  getCreditedArtistsWithProfilesMock: vi.fn(),
  getStructuredReleaseCollaboratorsMock: vi.fn(),
  getReleasesForProfileLiteMock: vi.fn(),
}));

vi.mock('@/lib/discography/artist-queries', () => ({
  getCreditedArtistsWithProfiles: getCreditedArtistsWithProfilesMock,
  getStructuredReleaseCollaborators: getStructuredReleaseCollaboratorsMock,
}));

vi.mock('@/lib/discography/queries', () => ({
  getReleasesForProfileLite: getReleasesForProfileLiteMock,
}));

vi.mock('@/features/profile/views/ProfileIntentPage', () => ({
  ProfileIntentPage: ({
    artistHandle,
    children,
  }: {
    artistHandle: string;
    children: ReactNode;
  }) =>
    createElement(
      'section',
      { 'data-testid': 'profile-intent', 'data-handle': artistHandle },
      children
    ),
}));

vi.mock('@/features/profile/views/AboutView', () => ({
  AboutView: ({ artist }: { artist: { handle: string; name: string } }) =>
    createElement('div', {
      'data-testid': 'about-view',
      'data-handle': artist.handle,
      'data-name': artist.name,
    }),
}));

const NOT_FOUND_RESULT: PublicProfileLoaderResult = {
  profile: null,
  links: [],
  contacts: [],
  creatorIsPro: false,
  creatorClerkId: null,
  creatorMetaPixelId: null,
  youngAudience: false,
  genres: null,
  latestRelease: null,
  pressPhotos: [],
  status: 'not_found',
};

describe('public profile about route', () => {
  beforeEach(() => {
    getProfileAndLinksMock.mockReset();
    notFoundMock.mockClear();
    getProfileAndLinksMock.mockResolvedValue(NOT_FOUND_RESULT);
    getCreditedArtistsWithProfilesMock.mockReset().mockResolvedValue([]);
    getStructuredReleaseCollaboratorsMock.mockReset().mockResolvedValue([]);
    getReleasesForProfileLiteMock.mockReset().mockResolvedValue([]);
  });

  it('starts the bio reads without waiting for the credits read', async () => {
    getProfileAndLinksMock.mockResolvedValue({
      ...NOT_FOUND_RESULT,
      status: 'ok',
      profile: {
        id: 'profile-1',
        username: 'tim',
        display_name: 'Tim White',
        bio: 'Producer of Never Say A Word.',
        spotify_id: '4Uwpa6zW3zzCSQvooQNksm',
        settings: null,
      },
    } as unknown as PublicProfileLoaderResult);

    let releaseCredits: (value: never[]) => void = () => undefined;
    getStructuredReleaseCollaboratorsMock.mockReturnValue(
      new Promise<never[]>(resolve => {
        releaseCredits = resolve;
      })
    );

    const pending = AboutPage({ params: Promise.resolve({ username: 'tim' }) });

    // The credits read is still in flight; the bio reads must already be out.
    await vi.waitFor(() => {
      expect(getStructuredReleaseCollaboratorsMock).toHaveBeenCalledOnce();
      expect(getReleasesForProfileLiteMock).toHaveBeenCalledWith('profile-1');
      expect(getCreditedArtistsWithProfilesMock).toHaveBeenCalledWith(
        'profile-1'
      );
    });

    releaseCredits([]);
    const html = renderToStaticMarkup(await pending);
    expect(html).toContain('data-handle="tim"');
  });

  it('renders the reserved unfazed about fixture without a profile lookup', async () => {
    const page = await AboutPage({
      params: Promise.resolve({ username: 'Unfazed' }),
    });
    const html = renderToStaticMarkup(page);

    expect(getProfileAndLinksMock).not.toHaveBeenCalled();
    expect(notFoundMock).not.toHaveBeenCalled();
    expect(html).toContain('data-testid="about-view"');
    expect(html).toContain('data-handle="unfazed"');
    expect(html).toContain('data-name="Unfazed"');
  });

  it('still 404s a profile the loader cannot find', async () => {
    await expect(
      AboutPage({ params: Promise.resolve({ username: 'missing' }) })
    ).rejects.toThrow('NEXT_NOT_FOUND');

    expect(getProfileAndLinksMock).toHaveBeenCalledWith('missing');
    expect(notFoundMock).toHaveBeenCalledOnce();
  });

  it('noindexes the reserved unfazed about page without a profile lookup', async () => {
    const metadata = await generateMetadata({
      params: Promise.resolve({ username: 'unfazed' }),
    });

    expect(getProfileAndLinksMock).not.toHaveBeenCalled();
    expect(metadata.robots).toEqual({ index: false, follow: false });
    expect(metadata.title).toEqual({ absolute: 'About · Unfazed · Jovie' });
  });
});
