import {
  getRedirectUrl,
  unstable_getResponseFromNextConfig,
} from 'next/experimental/testing/server';
import { describe, expect, it } from 'vitest';
import { metadata } from '@/app/(marketing)/artist-profiles/page';
import { BASE_URL } from '@/constants/app';
import { APP_ROUTES } from '@/constants/routes';

type RedirectRule = {
  source: string;
  destination: string;
  permanent?: boolean;
  statusCode?: number;
};

describe('artist profile marketing routes', () => {
  it('301 redirects the singular alias to the canonical lander', async () => {
    const nextConfigModule = await import('../../../next.config.js');
    const nextConfig = nextConfigModule.default ?? nextConfigModule;
    const redirects = (await nextConfig.redirects()) as RedirectRule[];
    const response = await unstable_getResponseFromNextConfig({
      url: `${BASE_URL}${APP_ROUTES.ARTIST_PROFILE_LEGACY}?utm_source=audit`,
      nextConfig: { redirects: nextConfig.redirects },
    });

    expect(
      redirects.find(
        redirect => redirect.source === APP_ROUTES.ARTIST_PROFILE_LEGACY
      )
    ).toEqual({
      source: APP_ROUTES.ARTIST_PROFILE_LEGACY,
      destination: APP_ROUTES.ARTIST_PROFILES,
      statusCode: 301,
    });
    expect(response.status).toBe(301);
    expect(getRedirectUrl(response)).toBe(
      `${BASE_URL}${APP_ROUTES.ARTIST_PROFILES}?utm_source=audit`
    );
  });

  it('keeps canonical metadata on the plural lander', () => {
    const canonicalUrl = `${BASE_URL}${APP_ROUTES.ARTIST_PROFILES}`;

    expect(metadata.alternates?.canonical).toBe(canonicalUrl);
    expect(metadata.openGraph).toMatchObject({ url: canonicalUrl });
  });
});
