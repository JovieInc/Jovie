import { describe, expect, it } from 'vitest';
import { APP_ROUTES } from '@/constants/routes';
import {
  MARKETING_FOOTER_COLUMNS,
  MARKETING_FOR_FLYOUT_LINKS,
  MARKETING_NAV_LINKS,
  MARKETING_TOOLS_FLYOUT_LINKS,
} from '@/data/marketingNavigation';
import {
  getMarketingPageContractForPathname,
  getMarketingPageContractForRouteGlob,
  MARKETING_PAGE_CONTRACTS,
} from './pageContracts';

describe('marketing language context', () => {
  it.each([
    APP_ROUTES.HOME,
    APP_ROUTES.ABOUT,
    APP_ROUTES.PRICING,
    APP_ROUTES.SUPPORT,
    APP_ROUTES.DOWNLOAD,
    APP_ROUTES.WAITLIST,
  ])('keeps shared language on %s', pathname => {
    expect(getMarketingPageContractForPathname(pathname)?.copyScope).toBe(
      'shared'
    );
  });

  it.each([
    APP_ROUTES.ARTIST_PROFILES,
    APP_ROUTES.ARTIST_NOTIFICATIONS,
    APP_ROUTES.LAUNCH,
    APP_ROUTES.LANDING_NEW,
    APP_ROUTES.PAY,
    APP_ROUTES.INSTANT_MERCH,
    APP_ROUTES.CLI,
  ])('preserves music-specific language on %s', pathname => {
    expect(getMarketingPageContractForPathname(pathname)?.copyScope).toBe(
      'music'
    );
  });

  it('keeps YouTube packaging specific to video', () => {
    expect(
      getMarketingPageContractForPathname(APP_ROUTES.YOUTUBE_THUMBNAILS)
        ?.copyScope
    ).toBe('video');
  });

  it('keeps legacy artist aliases on the same scope and action', () => {
    const canonical = getMarketingPageContractForPathname(
      APP_ROUTES.ARTIST_PROFILES
    );
    const legacy = getMarketingPageContractForPathname(
      APP_ROUTES.ARTIST_PROFILE_LEGACY
    );
    expect(legacy?.copyScope).toBe(canonical?.copyScope);
    expect(legacy?.primaryCta).toEqual(canonical?.primaryCta);
  });

  it('leaves comparison and editorial subjects to their own content', () => {
    const contracts = Object.values(MARKETING_PAGE_CONTRACTS).filter(
      contract =>
        [APP_ROUTES.BLOG, APP_ROUTES.COMPARE, APP_ROUTES.ALTERNATIVES].some(
          prefix =>
            contract.url === prefix || contract.url.startsWith(`${prefix}/`)
        )
    );
    expect(contracts.length).toBeGreaterThan(0);
    for (const contract of contracts) {
      expect(contract.copyScope).toBe('editorial');
    }
  });

  it.each(['artist', 'founder', 'artist,founder', 'unknown'])(
    'does not infer homepage identity from a %s query parameter',
    role => {
      const contract = getMarketingPageContractForPathname(
        `${APP_ROUTES.HOME}?role=${encodeURIComponent(role)}`
      );
      expect(contract?.copyScope).toBe('shared');
      expect(contract).toBe(
        getMarketingPageContractForPathname(APP_ROUTES.HOME)
      );
    }
  );

  it.each(['__proto__', 'constructor', 'toString', 'missing/page.tsx'])(
    'rejects an unregistered contract key: %s',
    key => {
      expect(getMarketingPageContractForRouteGlob(key)).toBeNull();
    }
  );

  it.each([null, undefined, '', '/unregistered-language-fixture'])(
    'returns no invented contract for %s',
    pathname => {
      expect(getMarketingPageContractForPathname(pathname)).toBeNull();
    }
  );

  it('requires every registered authoring contract to declare a scope', () => {
    for (const contract of Object.values(MARKETING_PAGE_CONTRACTS)) {
      expect(['shared', 'music', 'video', 'editorial']).toContain(
        contract.copyScope
      );
      expect(getMarketingPageContractForRouteGlob(contract.routeGlob)).toBe(
        contract
      );
    }
  });

  it('keeps generic product navigation on shared destinations', () => {
    const genericLinks = [
      ...MARKETING_NAV_LINKS.filter(link =>
        /^(?:product|profiles|about|pricing)$/i.test(link.label)
      ),
      ...MARKETING_FOOTER_COLUMNS.filter(column =>
        /^(?:product|features)$/i.test(column.title)
      ).flatMap(column => column.links),
    ];
    expect(genericLinks.length).toBeGreaterThan(0);
    for (const link of genericLinks) {
      expect(
        getMarketingPageContractForPathname(link.href)?.copyScope,
        `${link.label} -> ${link.href}`
      ).toBe('shared');
    }
  });

  it('does not substitute company, editorial, or directory pages', () => {
    for (const link of MARKETING_FOR_FLYOUT_LINKS) {
      expect([
        APP_ROUTES.ABOUT,
        APP_ROUTES.BLOG,
        APP_ROUTES.ARTISTS,
      ]).not.toContain(link.href);
    }
  });

  it('retains the artist directory without calling it customer proof', () => {
    const directory = MARKETING_FOOTER_COLUMNS.flatMap(column =>
      column.links
    ).find(link => link.href === APP_ROUTES.ARTISTS);
    expect(directory?.label).toBe('Artist Directory');
  });

  it('describes the CLI as read-only public artist access', () => {
    const cli = MARKETING_TOOLS_FLYOUT_LINKS.find(
      link => link.href === APP_ROUTES.CLI
    );
    expect(cli?.description).toMatch(/read public artist data/i);
  });
});
