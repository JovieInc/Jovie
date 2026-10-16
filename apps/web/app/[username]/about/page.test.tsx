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

vi.mock('@/lib/discography/artist-queries', () => ({
  getCreditedArtistsWithProfiles: vi.fn(),
  getStructuredReleaseCollaborators: vi.fn(),
}));

vi.mock('@/lib/discography/queries', () => ({
  getReleasesForProfileLite: vi.fn(),
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
