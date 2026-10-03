import { describe, expect, it } from 'vitest';
import {
  artistSettingsNavigation,
  userSettingsNavigation,
} from '@/components/features/dashboard/dashboard-nav/config';
import { APP_ROUTES } from '@/constants/routes';
import {
  filterSettingsGroups,
  isSettingsItemActive,
  SETTINGS_SIDEBAR_GROUPS,
} from './settings-sidebar-config';

const LIVE_SETTINGS = [...userSettingsNavigation, ...artistSettingsNavigation];

describe('SETTINGS_SIDEBAR_GROUPS', () => {
  it('projects the live settings rail and no other list', () => {
    expect(SETTINGS_SIDEBAR_GROUPS.map(group => group.id)).toEqual([
      'account',
      'profile',
    ]);
    expect(
      SETTINGS_SIDEBAR_GROUPS.flatMap(group => group.items.map(item => item.id))
    ).toEqual(LIVE_SETTINGS.map(item => item.id));
    expect(
      SETTINGS_SIDEBAR_GROUPS.flatMap(group =>
        group.items.map(item => item.href)
      )
    ).toEqual(LIVE_SETTINGS.map(item => item.href));
  });

  it('keeps account rows on the user rail and profile rows on the artist rail', () => {
    const membership = Object.fromEntries(
      SETTINGS_SIDEBAR_GROUPS.map(group => [
        group.id,
        group.items.map(item => item.id),
      ])
    );

    expect(membership).toEqual({
      account: userSettingsNavigation.map(item => item.id),
      profile: artistSettingsNavigation.map(item => item.id),
    });
  });

  it('does not list redirected or removed settings rows', () => {
    const hrefs = SETTINGS_SIDEBAR_GROUPS.flatMap(group =>
      group.items.map(item => item.href)
    );

    expect(hrefs).not.toContain(APP_ROUTES.SETTINGS_APPEARANCE);
    expect(hrefs).not.toContain(APP_ROUTES.SETTINGS_RETARGETING_ADS);
    expect(hrefs).not.toContain(APP_ROUTES.SETTINGS_DELETE_ACCOUNT);
  });

  it('points every item at a settings route', () => {
    for (const item of SETTINGS_SIDEBAR_GROUPS.flatMap(group => group.items)) {
      expect(item.href.startsWith(`${APP_ROUTES.SETTINGS}/`)).toBe(true);
    }
  });

  it('never reuses an item id across groups', () => {
    const ids = SETTINGS_SIDEBAR_GROUPS.flatMap(group =>
      group.items.map(item => item.id)
    );
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('filterSettingsGroups', () => {
  it('returns every live row for an empty query', () => {
    const groups = filterSettingsGroups(SETTINGS_SIDEBAR_GROUPS, '');
    const ids = groups.flatMap(group => group.items.map(item => item.id));
    expect(ids).toEqual(LIVE_SETTINGS.map(item => item.id));
  });

  it('filters by item label, case-insensitively', () => {
    const groups = filterSettingsGroups(SETTINGS_SIDEBAR_GROUPS, 'PRIVACY');
    expect(groups).toHaveLength(1);
    expect(groups[0]?.items.map(item => item.id)).toEqual(['data-privacy']);
  });

  it('matches a group label and keeps its visible items', () => {
    const groups = filterSettingsGroups(SETTINGS_SIDEBAR_GROUPS, 'account');
    expect(groups.map(group => group.id)).toEqual(['account']);
    expect(groups[0]?.items.map(item => item.id)).toEqual(
      userSettingsNavigation.map(item => item.id)
    );
  });

  it('matches a single billing row without inventing a billing group', () => {
    const groups = filterSettingsGroups(SETTINGS_SIDEBAR_GROUPS, 'billing');
    expect(groups.map(group => group.id)).toEqual(['account']);
    expect(groups[0]?.items.map(item => item.id)).toEqual(['billing']);
  });

  it('returns an empty list when nothing matches', () => {
    expect(
      filterSettingsGroups(SETTINGS_SIDEBAR_GROUPS, 'zzz-no-match')
    ).toEqual([]);
  });

  it('never surfaces operator controls via search, even for admins', () => {
    for (const query of ['admin', 'ops', 'ovie']) {
      expect(filterSettingsGroups(SETTINGS_SIDEBAR_GROUPS, query)).toEqual([]);
      expect(
        filterSettingsGroups(SETTINGS_SIDEBAR_GROUPS, query, { isAdmin: true })
      ).toEqual([]);
    }
  });

  it('shows admins the same rows as creators', () => {
    const groups = filterSettingsGroups(SETTINGS_SIDEBAR_GROUPS, '', {
      isAdmin: true,
    });
    expect(groups.flatMap(group => group.items).map(item => item.id)).toEqual(
      LIVE_SETTINGS.map(item => item.id)
    );
  });
});

describe('customer settings stay free of operator surfaces (JOV-6771)', () => {
  it('links no item into Ovie or the legacy settings admin redirect', () => {
    for (const item of SETTINGS_SIDEBAR_GROUPS.flatMap(group => group.items)) {
      expect(item.href).not.toBe(APP_ROUTES.SETTINGS_ADMIN);
      expect(item.href.startsWith(APP_ROUTES.OV)).toBe(false);
      expect(item.href).not.toBe(APP_ROUTES.HUD);
    }
  });
});

describe('isSettingsItemActive', () => {
  it('matches exact paths', () => {
    expect(
      isSettingsItemActive(
        APP_ROUTES.SETTINGS_BILLING,
        APP_ROUTES.SETTINGS_BILLING
      )
    ).toBe(true);
  });

  it('matches nested paths', () => {
    expect(
      isSettingsItemActive(
        `${APP_ROUTES.SETTINGS_CONNECTORS}/google`,
        APP_ROUTES.SETTINGS_CONNECTORS
      )
    ).toBe(true);
  });

  it('does not match sibling prefixes', () => {
    expect(
      isSettingsItemActive(
        `${APP_ROUTES.SETTINGS_BILLING}-history`,
        APP_ROUTES.SETTINGS_BILLING
      )
    ).toBe(false);
  });
});
