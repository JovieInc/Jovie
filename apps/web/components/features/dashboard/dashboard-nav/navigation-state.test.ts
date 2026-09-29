import { describe, expect, it } from 'vitest';
import { APP_ROUTES } from '@/constants/routes';
import {
  audienceNavItem,
  homeNavItem,
  linksNavItem,
  profilesNavItem,
} from './config';
import { isNavigationItemActive } from './navigation-state';

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
  });

  it('matches Presence throughout its workspace', () => {
    expect(
      isNavigationItemActive(
        profilesNavItem,
        `${APP_ROUTES.PROFILES}/spotify`,
        new URLSearchParams()
      )
    ).toBe(true);
  });
});
