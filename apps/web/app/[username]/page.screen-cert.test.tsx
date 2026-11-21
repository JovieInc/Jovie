/**
 * Regression: the smart-link release page links to /jovie-screen-fixture.
 * Screenshot CI prefetches that RSC against a noop database, which 404s and
 * flakes smartlink-release-screen-proof.spec.ts. The reserved handle must
 * render when the fixture gate is open, and stay a 404 when it is closed.
 */

import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PublicProfileLoaderResult } from '@/app/[username]/_lib/public-profile-loader';
import ArtistPage, { generateMetadata } from '@/app/[username]/page';

const { getProfileAndLinksMock, notFoundMock } = vi.hoisted(() => ({
  getProfileAndLinksMock: vi.fn(),
  notFoundMock: vi.fn(() => {
    throw new Error('NEXT_NOT_FOUND');
  }),
}));

vi.mock('server-only', () => ({}));

vi.mock('next/navigation', () => ({
  notFound: notFoundMock,
  permanentRedirect: vi.fn((href: string) => {
    throw new Error(`REDIRECT:${href}`);
  }),
}));

vi.mock('@/app/[username]/_lib/public-profile-loader', () => ({
  getProfileAndLinks: (...args: unknown[]) => getProfileAndLinksMock(...args),
}));

vi.mock('@/lib/profile/opaque-internal-profile-handle.server', () => ({
  resolveOpaqueInternalProfileUsername: vi.fn(async () => ({
    action: 'continue',
  })),
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

const CAPTURE_ENV = {
  CI: 'true',
  NODE_ENV: 'production',
  PUBLIC_NOAUTH_SMOKE: '1',
} as const;

describe('screen-cert fixture profile root', () => {
  beforeEach(() => {
    getProfileAndLinksMock.mockReset();
    notFoundMock.mockClear();
    getProfileAndLinksMock.mockResolvedValue(NOT_FOUND_RESULT);
    vi.stubEnv('CI', CAPTURE_ENV.CI);
    vi.stubEnv('NODE_ENV', CAPTURE_ENV.NODE_ENV);
    vi.stubEnv('PUBLIC_NOAUTH_SMOKE', CAPTURE_ENV.PUBLIC_NOAUTH_SMOKE);
    vi.stubEnv('VERCEL_ENV', '');
    vi.stubEnv('NEXT_PUBLIC_E2E_MODE', '');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('renders the reserved handle without a profile lookup when capture fixtures are admitted', async () => {
    const page = await ArtistPage({
      params: Promise.resolve({ username: 'jovie-screen-fixture' }),
    });
    const html = renderToStaticMarkup(page);

    expect(getProfileAndLinksMock).not.toHaveBeenCalled();
    expect(notFoundMock).not.toHaveBeenCalled();
    expect(html).toContain('Screen Cert Fixture');
  });

  it('still 404s the reserved handle on a production deployment', async () => {
    vi.stubEnv('VERCEL_ENV', 'production');

    await expect(
      ArtistPage({
        params: Promise.resolve({ username: 'jovie-screen-fixture' }),
      })
    ).rejects.toThrow('NEXT_NOT_FOUND');

    expect(getProfileAndLinksMock).toHaveBeenCalledWith('jovie-screen-fixture');
    expect(notFoundMock).toHaveBeenCalled();
  });

  it('noindexes the admitted fixture profile without a profile lookup', async () => {
    const metadata = await generateMetadata({
      params: Promise.resolve({ username: 'jovie-screen-fixture' }),
    });

    expect(getProfileAndLinksMock).not.toHaveBeenCalled();
    expect(metadata.robots).toEqual({ index: false, follow: false });
    expect(metadata.title).toBe('Screen Cert Fixture | Jovie');
  });
});
