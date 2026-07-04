import { describe, expect, it } from 'vitest';
import { APP_ROUTES } from '@/constants/routes';
import {
  filterSettingsGroups,
  isSettingsItemActive,
  SETTINGS_SIDEBAR_GROUPS,
} from './settings-sidebar-config';

// Nav-structure snapshot: the settings IA is a reviewed fixture (approved
// 2026-07-03 via Design Shootout, `settings-ia`). Changing the groups or
// their membership requires a deliberate update here — see #12645.

describe('SETTINGS_SIDEBAR_GROUPS', () => {
  it('defines the approved 4-group IA', () => {
    expect(SETTINGS_SIDEBAR_GROUPS.map(group => group.id)).toEqual([
      'profile',
      'account',
      'workspace',
      'billing',
    ]);
  });

  it('assigns the 11 sub-pages (+admin) to their approved groups', () => {
    const membership = Object.fromEntries(
      SETTINGS_SIDEBAR_GROUPS.map(group => [
        group.id,
        group.items.map(item => item.id),
      ])
    );

    expect(membership).toEqual({
      profile: ['artist-profile', 'contacts', 'appearance'],
      account: ['account', 'data-privacy', 'delete-account'],
      workspace: ['connectors', 'retargeting-ads', 'admin'],
      billing: ['billing', 'usage', 'referral'],
    });
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
  it('returns all non-admin items for an empty query', () => {
    const groups = filterSettingsGroups(SETTINGS_SIDEBAR_GROUPS, '');
    const ids = groups.flatMap(group => group.items.map(item => item.id));
    expect(ids).not.toContain('admin');
    expect(ids).toHaveLength(11);
  });

  it('includes admin-only items for admins', () => {
    const groups = filterSettingsGroups(SETTINGS_SIDEBAR_GROUPS, '', {
      isAdmin: true,
    });
    const ids = groups.flatMap(group => group.items.map(item => item.id));
    expect(ids).toContain('admin');
    expect(ids).toHaveLength(12);
  });

  it('filters by item label, case-insensitively', () => {
    const groups = filterSettingsGroups(SETTINGS_SIDEBAR_GROUPS, 'PRIVACY');
    expect(groups).toHaveLength(1);
    expect(groups[0].items.map(item => item.id)).toEqual(['data-privacy']);
  });

  it('matches a group label and keeps its visible items', () => {
    const groups = filterSettingsGroups(SETTINGS_SIDEBAR_GROUPS, 'billing');
    expect(groups.map(group => group.id)).toEqual(['billing']);
    expect(groups[0].items.map(item => item.id)).toEqual([
      'billing',
      'usage',
      'referral',
    ]);
  });

  it('drops groups with no matching items', () => {
    const groups = filterSettingsGroups(SETTINGS_SIDEBAR_GROUPS, 'referral');
    expect(groups.map(group => group.id)).toEqual(['billing']);
  });

  it('returns an empty list when nothing matches', () => {
    expect(
      filterSettingsGroups(SETTINGS_SIDEBAR_GROUPS, 'zzz-no-match')
    ).toEqual([]);
  });

  it('never surfaces admin-only items via search for non-admins', () => {
    const groups = filterSettingsGroups(SETTINGS_SIDEBAR_GROUPS, 'admin');
    const ids = groups.flatMap(group => group.items.map(item => item.id));
    expect(ids).not.toContain('admin');
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
