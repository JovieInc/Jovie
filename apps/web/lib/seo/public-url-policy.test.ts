import { describe, expect, it } from 'vitest';
import { APP_ROUTES } from '@/constants/routes';
import { isReservedUsername } from '@/lib/validation/username-core';
import {
  getGoneReservedHandles,
  getPublicUrlPolicyEntry,
  getSitemapExcludedPublicPaths,
  PUBLIC_URL_POLICY,
  resolvePublicUrlGone,
} from './public-url-policy';

describe('public URL policy (GSC recovery)', () => {
  it('keeps known legal and auth aliases on permanent hops', () => {
    expect(getPublicUrlPolicyEntry('/privacy')).toMatchObject({
      action: 'redirect',
      destination: APP_ROUTES.LEGAL_PRIVACY,
      status: 308,
    });
    expect(getPublicUrlPolicyEntry('/terms')).toMatchObject({
      action: 'redirect',
      destination: APP_ROUTES.LEGAL_TERMS,
      status: 308,
    });
    expect(getPublicUrlPolicyEntry('/cookies')).toMatchObject({
      action: 'redirect',
      destination: APP_ROUTES.LEGAL_COOKIES,
      status: 308,
    });
    expect(getPublicUrlPolicyEntry('/sign-up')).toMatchObject({
      destination: APP_ROUTES.SIGNUP,
      status: 308,
    });
    expect(getPublicUrlPolicyEntry('/login')).toMatchObject({
      destination: APP_ROUTES.SIGNIN,
      status: 308,
    });
    expect(getPublicUrlPolicyEntry('/tips')).toMatchObject({
      destination: APP_ROUTES.PAY,
      status: 308,
    });
  });

  it('marks only root /music and /shows gone and keeps /you claimable', () => {
    expect(resolvePublicUrlGone('/music')).toBe(true);
    expect(resolvePublicUrlGone('/shows')).toBe(true);
    expect(resolvePublicUrlGone('/tim/music')).toBe(false);
    expect(resolvePublicUrlGone('/tim/shows')).toBe(false);
    expect(resolvePublicUrlGone('/product')).toBe(false);
    expect(resolvePublicUrlGone('/you')).toBe(false);
    expect(getPublicUrlPolicyEntry('/you')).toMatchObject({
      action: 'hold',
      owner: 'summer',
    });
  });

  it('leaves /product Design Ready and does not reserve /product or /you', () => {
    expect(getPublicUrlPolicyEntry('/product')).toMatchObject({
      action: 'shipping',
      owner: 'web',
    });
    expect(getPublicUrlPolicyEntry('/product')).not.toHaveProperty(
      'destination'
    );
    expect(isReservedUsername('product')).toBe(false);
    expect(isReservedUsername('you')).toBe(false);
    expect(getGoneReservedHandles()).toEqual(['music', 'shows']);
    for (const handle of getGoneReservedHandles()) {
      expect(isReservedUsername(handle)).toBe(true);
    }
  });

  it('excludes aliases and gone roots from the sitemap', () => {
    const excluded = getSitemapExcludedPublicPaths();
    expect(excluded).toEqual(
      expect.arrayContaining([
        '/privacy',
        '/terms',
        '/cookies',
        '/music',
        '/shows',
      ])
    );
    expect(excluded).not.toContain('/product');
    expect(excluded).not.toContain('/you');
    expect(excluded).not.toContain(APP_ROUTES.LEGAL_PRIVACY);
  });

  it('matches next.config permanent aliases for the legal and auth hops', async () => {
    const nextConfigModule = await import('../../next.config.js');
    const nextConfig = nextConfigModule.default ?? nextConfigModule;
    const redirects = await nextConfig.redirects();

    for (const entry of PUBLIC_URL_POLICY) {
      if (entry.action !== 'redirect') continue;
      if (entry.path === '/login' || entry.path === '/request-access') {
        continue;
      }
      expect(
        redirects.find(
          (redirect: { source: string }) => redirect.source === entry.path
        )
      ).toMatchObject({
        source: entry.path,
        destination: entry.destination,
        permanent: true,
      });
    }
  });
});
