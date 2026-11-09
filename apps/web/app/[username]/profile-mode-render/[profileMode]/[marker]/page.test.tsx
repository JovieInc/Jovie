import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  PROFILE_MODE_ALIAS_MARKER,
  RENDER_FIXTURE_METADATA,
} from '@/lib/render-fixture-policy';

const { artistPage, profileMetadata, notFoundMock } = vi.hoisted(() => ({
  artistPage: vi.fn<
    (props: {
      params: Promise<{ username: string; __profileMode: string }>;
    }) => Promise<string>
  >(async () => 'rendered'),
  profileMetadata: vi.fn(async () => ({ title: 'Artist' })),
  notFoundMock: vi.fn(() => {
    throw new Error('NEXT_NOT_FOUND');
  }),
}));

vi.mock('next/navigation', () => ({
  notFound: notFoundMock,
}));

vi.mock('@/app/[username]/page', () => ({
  default: artistPage,
  generateMetadata: profileMetadata,
}));

vi.mock('@/app/[username]/_lib/profile-static-params', () => ({
  getProfileModeRenderStaticParams: () => [],
}));

import ProfileModeRenderPage, { generateMetadata } from './page';

const marker = PROFILE_MODE_ALIAS_MARKER;

describe('profile mode render miss boundary', () => {
  beforeEach(() => {
    artistPage.mockClear();
    profileMetadata.mockClear();
    notFoundMock.mockClear();
  });

  it('returns miss metadata without calling notFound() in generateMetadata', async () => {
    const metadata = await generateMetadata({
      params: Promise.resolve({
        username: 'missing-qa-user',
        profileMode: 'nope',
        marker,
      }),
    });

    expect(metadata).toEqual({
      title: 'Not Found',
      robots: RENDER_FIXTURE_METADATA.robots,
    });
    expect(notFoundMock).not.toHaveBeenCalled();
    expect(profileMetadata).not.toHaveBeenCalled();
  });

  it('still noindexes a real rewritten mode', async () => {
    const metadata = await generateMetadata({
      params: Promise.resolve({
        username: 'dualipa',
        profileMode: 'releases',
        marker,
      }),
    });

    expect(profileMetadata).toHaveBeenCalledOnce();
    expect(metadata).toMatchObject({
      title: 'Artist',
      robots: RENDER_FIXTURE_METADATA.robots,
    });
    expect(notFoundMock).not.toHaveBeenCalled();
  });

  it('lets the page notFound() render the branded boundary for a miss', async () => {
    await expect(
      ProfileModeRenderPage({
        params: Promise.resolve({
          username: 'missing-qa-user',
          profileMode: 'releases',
          marker: 'not-the-alias',
        }),
      })
    ).rejects.toThrow('NEXT_NOT_FOUND');

    expect(notFoundMock).toHaveBeenCalledOnce();
    expect(artistPage).not.toHaveBeenCalled();
  });

  it('renders the canonical profile page for a private mode alias', async () => {
    await expect(
      ProfileModeRenderPage({
        params: Promise.resolve({
          username: 'dualipa',
          profileMode: 'releases',
          marker,
        }),
      })
    ).resolves.toBe('rendered');

    expect(notFoundMock).not.toHaveBeenCalled();
    const params = artistPage.mock.calls[0]?.[0]?.params;
    await expect(params).resolves.toEqual({
      username: 'dualipa',
      __profileMode: 'releases',
    });
  });
});
