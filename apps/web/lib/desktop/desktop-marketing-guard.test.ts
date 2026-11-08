import { readdirSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { APP_ROUTES } from '@/constants/routes';
import {
  DESKTOP_MARKETING_GUARD_EXEMPT_SEGMENTS,
  DESKTOP_MARKETING_ROUTE_SEGMENTS,
  isDesktopMarketingPath,
  isDesktopShellUserAgent,
  resolveDesktopMarketingRedirect,
  resolveDesktopSignOutRedirect,
} from './desktop-marketing-guard';

const DESKTOP_UA =
  'Mozilla/5.0 (Macintosh) AppleWebKit/537.36 Electron/44 JovieDesktop/26.10.16';
const BROWSER_UA = 'Mozilla/5.0 (Macintosh) AppleWebKit/537.36 Chrome/140';

const MARKETING_ROUTE_GROUP = path.resolve(__dirname, '../../app/(marketing)');

function marketingRouteGroupSegments(): string[] {
  return readdirSync(MARKETING_ROUTE_GROUP, { withFileTypes: true })
    .filter(entry => entry.isDirectory())
    .map(entry => entry.name)
    .filter(name => !name.startsWith('_') && !name.startsWith('('));
}

describe('desktop marketing guard', () => {
  it('guards or explicitly exempts every app/(marketing) route', () => {
    const guarded = new Set<string>(DESKTOP_MARKETING_ROUTE_SEGMENTS);
    const exempt = new Set(
      Object.keys(DESKTOP_MARKETING_GUARD_EXEMPT_SEGMENTS)
    );
    const uncovered = marketingRouteGroupSegments().filter(
      segment => !guarded.has(segment) && !exempt.has(segment)
    );

    expect(uncovered).toEqual([]);
  });

  it('never guards an exempt route', () => {
    for (const segment of Object.keys(
      DESKTOP_MARKETING_GUARD_EXEMPT_SEGMENTS
    )) {
      expect(isDesktopMarketingPath(`/${segment}`)).toBe(false);
    }
  });

  it.each([
    '/',
    '/pricing',
    '/pricing/',
    '/Pricing',
    '/blog/launch-week',
    '/compare/linktree',
    '/%70ricing',
  ])('treats %s as a marketing page', pathname => {
    expect(isDesktopMarketingPath(pathname)).toBe(true);
  });

  it.each([
    '/app',
    '/app/chat',
    '/signin',
    '/onboarding',
    '/billing',
    '/support',
    '/tim',
    '/pricingx',
    '/%E0%A4%A',
  ])('does not treat %s as a marketing page', pathname => {
    expect(isDesktopMarketingPath(pathname)).toBe(false);
  });

  it('recognises only the desktop shell user agent', () => {
    expect(isDesktopShellUserAgent(DESKTOP_UA)).toBe(true);
    expect(isDesktopShellUserAgent(BROWSER_UA)).toBe(false);
    expect(isDesktopShellUserAgent(null)).toBe(false);
    expect(isDesktopShellUserAgent('NotJovieDesktop/1')).toBe(false);
  });

  it('redirects desktop marketing navigations to the app home', () => {
    expect(
      resolveDesktopMarketingRedirect({
        method: 'GET',
        pathname: '/',
        userAgent: DESKTOP_UA,
      })
    ).toBe(`${APP_ROUTES.CHAT}?runtime=electron`);
  });

  it('leaves browsers, app routes and non-navigation methods alone', () => {
    expect(
      resolveDesktopMarketingRedirect({
        method: 'GET',
        pathname: '/pricing',
        userAgent: BROWSER_UA,
      })
    ).toBeNull();
    expect(
      resolveDesktopMarketingRedirect({
        method: 'GET',
        pathname: '/app/chat',
        userAgent: DESKTOP_UA,
      })
    ).toBeNull();
    expect(
      resolveDesktopMarketingRedirect({
        method: 'POST',
        pathname: '/pricing',
        userAgent: DESKTOP_UA,
      })
    ).toBeNull();
  });

  it('sends desktop sign-out to sign-in instead of the homepage', () => {
    expect(resolveDesktopSignOutRedirect('/', true)).toBe(APP_ROUTES.SIGNIN);
    expect(resolveDesktopSignOutRedirect('/pricing?x=1', true)).toBe(
      APP_ROUTES.SIGNIN
    );
    expect(resolveDesktopSignOutRedirect('/signin', true)).toBe('/signin');
    expect(resolveDesktopSignOutRedirect('/', false)).toBe('/');
  });
});
