import { describe, expect, it } from 'vitest';
import { APP_ROUTES } from '@/constants/routes';
import {
  audienceNavItem,
  homeNavItem,
  libraryNavItem,
  linksNavItem,
  presenceNavItem,
} from './config';
import {
  getRailNavigation,
  isNavigationItemActive,
  isNavigationItemHighlighted,
} from './navigation-state';

describe('isNavigationItemActive', () => {
  it('keeps Home scoped to the shell root', () => {
    const params = new URLSearchParams();

    expect(
      isNavigationItemActive(homeNavItem, APP_ROUTES.DASHBOARD, params)
    ).toBe(true);
    expect(isNavigationItemActive(homeNavItem, APP_ROUTES.CHAT, params)).toBe(
      false
    );
  });

  it('matches Links only when the identity panel is open', () => {
    expect(
      isNavigationItemActive(
        linksNavItem,
        APP_ROUTES.CHAT,
        new URLSearchParams()
      )
    ).toBe(false);
    expect(
      isNavigationItemActive(
        linksNavItem,
        APP_ROUTES.CHAT,
        new URLSearchParams('panel=profile')
      )
    ).toBe(true);
  });

  it('keeps Audience active while contextual filters change', () => {
    expect(
      isNavigationItemActive(
        audienceNavItem,
        APP_ROUTES.CONTACTS,
        new URLSearchParams('tab=audience&view=identified')
      )
    ).toBe(true);
    expect(
      isNavigationItemActive(
        audienceNavItem,
        APP_ROUTES.CONTACTS,
        new URLSearchParams('tab=contacts')
      )
    ).toBe(false);

    for (const route of [
      APP_ROUTES.INSIGHTS,
      `${APP_ROUTES.INSIGHTS}/priority/high`,
    ]) {
      expect(
        isNavigationItemActive(audienceNavItem, route, new URLSearchParams())
      ).toBe(true);
    }
  });

  it('matches Presence throughout its workspace', () => {
    expect(
      isNavigationItemActive(
        presenceNavItem,
        `${APP_ROUTES.PRESENCE}/spotify`,
        new URLSearchParams()
      )
    ).toBe(true);
  });

  it('matches Work throughout canonical and compatible routes', () => {
    for (const route of [
      APP_ROUTES.LIBRARY,
      APP_ROUTES.LEGACY_DASHBOARD_LIBRARY,
      APP_ROUTES.RELEASES,
      APP_ROUTES.DASHBOARD_RELEASES,
      APP_ROUTES.YOUTUBE_REVIVAL,
    ]) {
      expect(
        isNavigationItemActive(
          libraryNavItem,
          `${route}/nested`,
          new URLSearchParams()
        )
      ).toBe(true);
    }
  });
});

describe('getRailNavigation', () => {
  const items = [homeNavItem, presenceNavItem, libraryNavItem];

  it('drops only the Inbox row when the header bell owns the inbox', () => {
    expect(getRailNavigation(items, true)).toEqual([
      presenceNavItem,
      libraryNavItem,
    ]);
    expect(getRailNavigation(items, false)).toEqual(items);
  });
});

describe('isNavigationItemHighlighted', () => {
  it('paints the current page when nothing is pending', () => {
    expect(isNavigationItemHighlighted('home', true, undefined)).toBe(true);
    expect(isNavigationItemHighlighted('audience', false, undefined)).toBe(
      false
    );
  });

  it('moves the paint to the pending destination so one row is selected', () => {
    expect(isNavigationItemHighlighted('home', true, 'audience')).toBe(false);
    expect(isNavigationItemHighlighted('audience', false, 'audience')).toBe(
      true
    );
  });
});
