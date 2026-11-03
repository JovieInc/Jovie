import { describe, expect, it } from 'vitest';
import sitemap from '@/app/sitemap';
import { APP_ROUTES } from '@/constants/routes';
import {
  isIndexableCapabilityPath,
  isNavigationEligiblePath,
} from '@/data/marketing/featureAvailability';
import { WITHHELD_MARKETING_ROUTES } from '@/data/marketing/withheldRoutes';
import {
  getMarketingToolsFlyoutLinks,
  getPublicCommercialFooterLinks,
  MARKETING_FOOTER_COLUMNS,
  MARKETING_NAV_LINKS,
  MARKETING_TOOLS_FLYOUT_LINKS,
  PUBLIC_COMMERCIAL_FOOTER_LINKS,
} from '@/data/marketingNavigation';
import {
  getExactPublishedMarketingPaths,
  sitemapPathname,
} from '@/lib/seo/sitemap-publication';

const PAGE_LOADERS: Record<string, () => Promise<{ metadata?: unknown }>> = {
  '/card': () => import('@/app/(marketing)/card/page'),
  '/voice': () => import('@/app/(marketing)/voice/page'),
  '/demovideo': () => import('@/app/(marketing)/demovideo/page'),
  '/demo/video': () => import('@/app/(marketing)/demo/video/page'),
  '/youtube-thumbnails': () =>
    import('@/app/(marketing)/youtube-thumbnails/page'),
  '/integrations': () => import('@/app/(marketing)/integrations/page'),
  '/compare': () => import('@/app/(marketing)/compare/page'),
  '/alternatives': () => import('@/app/(marketing)/alternatives/page'),
  '/proof/methodology': () =>
    import('@/app/(marketing)/proof/methodology/page'),
};

const withheld = new Set(WITHHELD_MARKETING_ROUTES.map(entry => entry.route));

function allNavHrefs(): string[] {
  return [
    ...MARKETING_NAV_LINKS,
    ...MARKETING_TOOLS_FLYOUT_LINKS,
    ...getMarketingToolsFlyoutLinks(true),
    ...PUBLIC_COMMERCIAL_FOOTER_LINKS,
    ...getPublicCommercialFooterLinks(true),
    ...MARKETING_FOOTER_COLUMNS.flatMap(column => column.links),
  ].map(link => sitemapPathname(link.href));
}

describe('withheld marketing routes', () => {
  it('registers every dead-end route with a reason and a return condition', () => {
    expect([...withheld].sort()).toEqual(
      [
        APP_ROUTES.CARD,
        APP_ROUTES.VOICE,
        '/demovideo',
        '/demo/video',
        APP_ROUTES.YOUTUBE_THUMBNAILS,
        APP_ROUTES.INTEGRATIONS,
        APP_ROUTES.COMPARE,
        APP_ROUTES.ALTERNATIVES,
        APP_ROUTES.PROOF_METHODOLOGY,
      ].sort()
    );
    for (const entry of WITHHELD_MARKETING_ROUTES) {
      expect(entry.reason.length).toBeGreaterThan(10);
      expect(entry.returnsWhen.length).toBeGreaterThan(10);
      expect(entry.note.length).toBeGreaterThan(10);
    }
  });

  it('withholds voice discovery until a real sample or UI capture exists', () => {
    const voice = WITHHELD_MARKETING_ROUTES.find(
      entry => entry.route === APP_ROUTES.VOICE
    );
    expect(voice?.returnsWhen).toBe(
      'a real voice sample or voice UI capture exists'
    );
    for (const href of [
      '/voice',
      '/voice/',
      '/voice?source=footer',
      '/voice#sample',
    ]) {
      expect(isNavigationEligiblePath(href), href).toBe(false);
      expect(isIndexableCapabilityPath(href), href).toBe(false);
    }
    expect(allNavHrefs()).not.toContain(APP_ROUTES.VOICE);
  });

  it('keeps withheld routes out of header, flyout, and footer navigation', () => {
    for (const href of allNavHrefs()) {
      expect(withheld.has(href), `nav links to withheld ${href}`).toBe(false);
    }
  });

  it('keeps withheld routes out of the sitemap', async () => {
    const published = getExactPublishedMarketingPaths();
    for (const route of withheld) {
      expect(published).not.toContain(route);
    }
    const urls = (await sitemap()).map(entry => sitemapPathname(entry.url));
    for (const route of withheld) {
      expect(urls, `sitemap lists ${route}`).not.toContain(route);
    }
  });

  const LEAF_PUBLISHING_HUBS = new Set(['/compare', '/alternatives']);

  it.each([...withheld])('serves %s with noindex metadata', async route => {
    const load = PAGE_LOADERS[route];
    expect(load, `no page loader for ${route}`).toBeDefined();
    const { metadata } = (await load()) as {
      metadata?: { robots?: { index?: boolean; follow?: boolean } };
    };
    expect(metadata?.robots?.index, `${route} must be noindex`).toBe(false);
    // Hubs keep follow so crawlers still reach their published leaf pages.
    const expectFollow = LEAF_PUBLISHING_HUBS.has(route);
    expect(
      metadata?.robots?.follow,
      `${route} must be ${expectFollow ? 'follow' : 'nofollow'}`
    ).toBe(expectFollow);
  });
});
