import { describe, expect, it } from 'vitest';
import {
  artistSettingsNavigation,
  paymentsNavItem,
  userSettingsNavigation,
} from '@/components/features/dashboard/dashboard-nav/config';
import { APP_ROUTES } from '@/constants/routes';
import { APP_SCREEN_REGISTRY } from '@/data/appScreens/registry';
import { validateSettingsAdmission } from '@/data/appScreens/validation';
import {
  filterSettingsGroups,
  getSettingsAdmission,
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

  it('assigns the 8 sub-pages to their approved groups', () => {
    const membership = Object.fromEntries(
      SETTINGS_SIDEBAR_GROUPS.map(group => [
        group.id,
        group.items.map(item => item.id),
      ])
    );

    expect(membership).toEqual({
      profile: ['artist-profile', 'contacts'],
      account: ['account', 'data-privacy', 'delete-account'],
      workspace: ['connections'],
      billing: ['billing', 'usage'],
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
  it('returns all 8 items for an empty query', () => {
    const groups = filterSettingsGroups(SETTINGS_SIDEBAR_GROUPS, '');
    const ids = groups.flatMap(group => group.items.map(item => item.id));
    expect(ids).toHaveLength(8);
  });

  it('filters by item label, case-insensitively', () => {
    const groups = filterSettingsGroups(SETTINGS_SIDEBAR_GROUPS, 'PRIVACY');
    expect(groups).toHaveLength(1);
    expect(groups[0].items.map(item => item.id)).toEqual(['data-privacy']);
  });

  it('matches a group label and keeps its visible items', () => {
    const groups = filterSettingsGroups(SETTINGS_SIDEBAR_GROUPS, 'billing');
    expect(groups.map(group => group.id)).toEqual(['billing']);
    expect(groups[0].items.map(item => item.id)).toEqual(['billing', 'usage']);
  });

  it('drops groups with no matching items', () => {
    const groups = filterSettingsGroups(SETTINGS_SIDEBAR_GROUPS, 'referral');
    expect(groups).toEqual([]);
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

  it('shows admins the same 8 items as creators', () => {
    const groups = filterSettingsGroups(SETTINGS_SIDEBAR_GROUPS, '', {
      isAdmin: true,
    });
    expect(groups.flatMap(group => group.items)).toHaveLength(8);
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

describe('settings decision admission', () => {
  it('validates the navigation actually rendered by UnifiedSidebar, including gated Payments', () => {
    expect(
      validateSettingsAdmission(
        [
          {
            items: [
              ...userSettingsNavigation,
              ...artistSettingsNavigation,
              paymentsNavItem,
            ],
          },
        ],
        APP_SCREEN_REGISTRY
      )
    ).toEqual([]);
  });

  it('rejects a live navigation entry without admission', () => {
    expect(() => getSettingsAdmission('unreviewed')).toThrow(
      'Missing settings admission'
    );
  });

  it('connects each navigation entry to an existing canonical screen', () => {
    expect(
      validateSettingsAdmission(SETTINGS_SIDEBAR_GROUPS, APP_SCREEN_REGISTRY)
    ).toEqual([]);
  });

  it.each([
    ['export', 'data-privacy'],
    ['scopes', 'connections'],
    ['legibility', 'account'],
  ])('finds the user job %s', (query, id) => {
    expect(
      filterSettingsGroups(SETTINGS_SIDEBAR_GROUPS, query).flatMap(group =>
        group.items.map(item => item.id)
      )
    ).toEqual([id]);
  });

  it('preserves consent, account controls and meaningful manual overrides', () => {
    const items = SETTINGS_SIDEBAR_GROUPS.flatMap(group => group.items);
    expect(
      items.find(item => item.id === 'connections')?.admission.roles
    ).toContain('consent');
    expect(
      items.find(item => item.id === 'data-privacy')?.admission.roles
    ).toContain('account-control');
    expect(
      items.find(item => item.id === 'account')?.admission.overrideReason
    ).toBeTruthy();
  });

  it.each([
    ['missing rationale', { screenRationale: '' }, 'missing-rationale'],
    ['unknown scope', { scope: 'operator' }, 'invalid-scope'],
    ['empty roles', { roles: [] }, 'invalid-role'],
    [
      'invented screen',
      { canonicalRoute: '/app/settings/invented' },
      'canonical-screen-mismatch',
    ],
    ['task approval', { roles: ['workflow-action'] }, 'invalid-role'],
    ['operator setting', { roles: ['operator'] }, 'invalid-role'],
    [
      'unexplained default',
      { defaultBehavior: 'Automatic', overrideReason: undefined },
      'missing-override-reason',
    ],
  ])('rejects %s metadata', (_name, change, code) => {
    const groups = SETTINGS_SIDEBAR_GROUPS.map(group => ({
      ...group,
      items: group.items.map(item =>
        item.id === 'connections'
          ? { ...item, admission: { ...item.admission, ...change } }
          : item
      ),
    }));
    expect(
      validateSettingsAdmission(
        groups as typeof SETTINGS_SIDEBAR_GROUPS,
        APP_SCREEN_REGISTRY
      ).map(issue => issue.code)
    ).toContain(code);
  });

  it('rejects duplicate navigation identities and orphaned routes', () => {
    const first = SETTINGS_SIDEBAR_GROUPS[0];
    const groups = [
      ...SETTINGS_SIDEBAR_GROUPS,
      {
        ...first,
        items: [{ ...first.items[0], href: '/app/settings/orphan' }],
      },
    ];
    expect(
      validateSettingsAdmission(groups, APP_SCREEN_REGISTRY).map(
        issue => issue.code
      )
    ).toEqual(['duplicate-item', 'canonical-screen-mismatch']);
  });

  it('does not promote an alias into a separate canonical screen', () => {
    const groups = SETTINGS_SIDEBAR_GROUPS.map(group => ({
      ...group,
      items: group.items.map(item =>
        item.id === 'delete-account'
          ? {
              ...item,
              admission: { ...item.admission, canonicalRoute: item.href },
            }
          : item
      ),
    }));
    expect(
      validateSettingsAdmission(groups, APP_SCREEN_REGISTRY).map(
        issue => issue.code
      )
    ).toContain('canonical-screen-mismatch');
  });
});
