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
    // The retired route no longer has an APP_ROUTES entry on Main.
    expect(hrefs).not.toContain('/app/settings/retargeting-ads');
    expect(hrefs).not.toContain(APP_ROUTES.SETTINGS_DELETE_ACCOUNT);
  });

  it('keeps each live row label, icon and tooltip when the rail changes', () => {
    const rows = SETTINGS_SIDEBAR_GROUPS.flatMap(group => group.items);
    for (const live of LIVE_SETTINGS) {
      expect(rows.find(row => row.id === live.id)).toEqual({
        id: live.id,
        label: live.name,
        href: live.href,
        icon: live.icon,
        admission: live.admission,
        ...(live.description ? { title: live.description } : {}),
      });
    }
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
    expect(getSettingsAdmission('connections').scope).toBe('account');
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
    const dataPrivacy = SETTINGS_SIDEBAR_GROUPS.flatMap(
      group => group.items
    ).find(item => item.id === 'data-privacy');
    const groups = [
      ...SETTINGS_SIDEBAR_GROUPS,
      {
        id: 'retired-alias',
        label: 'Retired alias',
        items: [
          {
            ...dataPrivacy!,
            id: 'delete-account',
            href: APP_ROUTES.SETTINGS_DELETE_ACCOUNT,
            admission: {
              ...dataPrivacy!.admission,
              canonicalRoute: APP_ROUTES.SETTINGS_DELETE_ACCOUNT,
            },
          },
        ],
      },
    ];
    expect(
      validateSettingsAdmission(groups, APP_SCREEN_REGISTRY).map(
        issue => issue.code
      )
    ).toContain('canonical-screen-mismatch');
  });
});
