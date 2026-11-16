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
  filterSettingsAdmissions,
  getSettingsAdmission,
  isSettingsAdmissionRouteActive,
  SETTINGS_ADMISSION_GROUPS,
} from './settings-decision-admission';

const LIVE_SETTINGS = [...userSettingsNavigation, ...artistSettingsNavigation];

describe('SETTINGS_ADMISSION_GROUPS', () => {
  it('projects the live settings rail and no other list', () => {
    expect(SETTINGS_ADMISSION_GROUPS.map(group => group.id)).toEqual([
      'account',
      'profile',
    ]);
    expect(
      SETTINGS_ADMISSION_GROUPS.flatMap(group =>
        group.items.map(item => item.id)
      )
    ).toEqual(LIVE_SETTINGS.map(item => item.id));
    expect(
      SETTINGS_ADMISSION_GROUPS.flatMap(group =>
        group.items.map(item => item.href)
      )
    ).toEqual(LIVE_SETTINGS.map(item => item.href));
  });

  it('keeps account rows on the user rail and profile rows on the artist rail', () => {
    const membership = Object.fromEntries(
      SETTINGS_ADMISSION_GROUPS.map(group => [
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
    const hrefs = SETTINGS_ADMISSION_GROUPS.flatMap(group =>
      group.items.map(item => item.href)
    );

    expect(hrefs).not.toContain(APP_ROUTES.SETTINGS_APPEARANCE);
    // The retired route no longer has an APP_ROUTES entry on Main.
    expect(hrefs).not.toContain('/app/settings/retargeting-ads');
    expect(hrefs).not.toContain(APP_ROUTES.SETTINGS_DELETE_ACCOUNT);
  });

  it('keeps each live row label, icon and tooltip when the rail changes', () => {
    const rows = SETTINGS_ADMISSION_GROUPS.flatMap(group => group.items);
    for (const live of LIVE_SETTINGS) {
      expect(rows.find(row => row.id === live.id)).toEqual({
        id: live.id,
        label: live.name,
        href: live.href,
        admission: live.admission,
        icon: live.icon,
        ...(live.description ? { title: live.description } : {}),
      });
    }
  });

  it('points every item at a settings route', () => {
    for (const item of SETTINGS_ADMISSION_GROUPS.flatMap(
      group => group.items
    )) {
      expect(item.href.startsWith(`${APP_ROUTES.SETTINGS}/`)).toBe(true);
    }
  });

  it('never reuses an item id across groups', () => {
    const ids = SETTINGS_ADMISSION_GROUPS.flatMap(group =>
      group.items.map(item => item.id)
    );
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('filterSettingsAdmissions', () => {
  it('returns every live row for an empty query', () => {
    const groups = filterSettingsAdmissions(SETTINGS_ADMISSION_GROUPS, '');
    const ids = groups.flatMap(group => group.items.map(item => item.id));
    expect(ids).toEqual(LIVE_SETTINGS.map(item => item.id));
  });

  it('filters by item label, case-insensitively', () => {
    const groups = filterSettingsAdmissions(
      SETTINGS_ADMISSION_GROUPS,
      'PRIVACY'
    );
    expect(groups).toHaveLength(1);
    expect(groups[0]?.items.map(item => item.id)).toEqual(['data-privacy']);
  });

  it('matches a group label and keeps its visible items', () => {
    const groups = filterSettingsAdmissions(
      SETTINGS_ADMISSION_GROUPS,
      'account'
    );
    expect(groups.map(group => group.id)).toEqual(['account']);
    expect(groups[0]?.items.map(item => item.id)).toEqual(
      userSettingsNavigation.map(item => item.id)
    );
  });

  it('matches a single billing row without inventing a billing group', () => {
    const groups = filterSettingsAdmissions(
      SETTINGS_ADMISSION_GROUPS,
      'billing'
    );
    expect(groups.map(group => group.id)).toEqual(['account']);
    expect(groups[0]?.items.map(item => item.id)).toEqual(['billing']);
  });

  it('returns an empty list when nothing matches', () => {
    expect(
      filterSettingsAdmissions(SETTINGS_ADMISSION_GROUPS, 'zzz-no-match')
    ).toEqual([]);
  });

  it.each([
    ['subscription billing', ['billing']],
    ['  BILLING   subscription  ', ['billing']],
    ['billing&subscription', ['billing']],
    ['terms billing', ['billing']],
    ['scopes connections', ['connections']],
    ['privacy choices export', ['data-privacy']],
    ['billing nonsense', []],
    ['age', []],
    ['!!!', []],
  ])('matches every query word at a word boundary: %s', (query, ids) => {
    expect(
      filterSettingsAdmissions(SETTINGS_ADMISSION_GROUPS, query).flatMap(
        group => group.items.map(item => item.id)
      )
    ).toEqual(ids);
  });

  it('searches Unicode labels and descriptions without requiring accents', () => {
    const groups = [
      {
        id: 'synthetic',
        label: 'Synthetic',
        items: [
          {
            ...SETTINGS_ADMISSION_GROUPS[0].items[0],
            label: 'Beyoncé — 東京',
            title: 'Réglages avancés',
          },
        ],
      },
    ];
    for (const query of ['BEYONCE 東京', 'avances reglages', 'Beyonce\u0301']) {
      expect(filterSettingsAdmissions(groups, query)[0]?.items).toEqual(
        groups[0].items
      );
    }
    expect(filterSettingsAdmissions(groups, 'beyonce missing')).toEqual([]);
  });

  it('does not search route, identity or admission-control metadata', () => {
    const groups = [
      {
        id: 'synthetic',
        label: 'Synthetic',
        items: [
          {
            ...SETTINGS_ADMISSION_GROUPS[0].items[0],
            id: 'hiddenidentity',
            label: 'Appearance',
            admission: {
              ...getSettingsAdmission('account'),
              userJob: 'Review theme preferences',
              scope: 'workspace' as const,
              screenRationale: 'Unlisted explanation',
            },
          },
        ],
      },
    ];
    for (const query of [
      'hiddenidentity',
      'workspace',
      'unlisted',
      'settings',
    ]) {
      expect(filterSettingsAdmissions(groups, query)).toEqual([]);
    }
  });

  it('filters admin-only candidates before matching their labels or group', () => {
    const groups = [
      {
        id: 'synthetic',
        label: 'Synthetic',
        items: [
          {
            ...SETTINGS_ADMISSION_GROUPS[0].items[0],
            label: 'Operator',
            adminOnly: true,
          },
        ],
      },
    ];
    for (const query of ['', 'synthetic', 'operator']) {
      expect(filterSettingsAdmissions(groups, query)).toEqual([]);
      expect(
        filterSettingsAdmissions(groups, query, { isAdmin: true })[0]?.items
      ).toEqual(groups[0].items);
    }
  });

  it('never surfaces operator controls via search, even for admins', () => {
    for (const query of ['admin', 'ops', 'ovie']) {
      expect(
        filterSettingsAdmissions(SETTINGS_ADMISSION_GROUPS, query)
      ).toEqual([]);
      expect(
        filterSettingsAdmissions(SETTINGS_ADMISSION_GROUPS, query, {
          isAdmin: true,
        })
      ).toEqual([]);
    }
  });

  it('shows admins the same rows as creators', () => {
    const groups = filterSettingsAdmissions(SETTINGS_ADMISSION_GROUPS, '', {
      isAdmin: true,
    });
    expect(groups.flatMap(group => group.items).map(item => item.id)).toEqual(
      LIVE_SETTINGS.map(item => item.id)
    );
  });
});

describe('customer settings stay free of operator surfaces (JOV-6771)', () => {
  it('links no item into Ovie or the legacy settings admin redirect', () => {
    for (const item of SETTINGS_ADMISSION_GROUPS.flatMap(
      group => group.items
    )) {
      expect(item.href).not.toBe(APP_ROUTES.SETTINGS_ADMIN);
      expect(item.href.startsWith(APP_ROUTES.OV)).toBe(false);
      expect(item.href).not.toBe(APP_ROUTES.HUD);
    }
  });
});

describe('isSettingsAdmissionRouteActive', () => {
  it('matches exact paths', () => {
    expect(
      isSettingsAdmissionRouteActive(
        APP_ROUTES.SETTINGS_BILLING,
        APP_ROUTES.SETTINGS_BILLING
      )
    ).toBe(true);
  });

  it('matches nested paths', () => {
    expect(
      isSettingsAdmissionRouteActive(
        `${APP_ROUTES.SETTINGS_CONNECTORS}/google`,
        APP_ROUTES.SETTINGS_CONNECTORS
      )
    ).toBe(true);
  });

  it('does not match sibling prefixes', () => {
    expect(
      isSettingsAdmissionRouteActive(
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
      validateSettingsAdmission(SETTINGS_ADMISSION_GROUPS, APP_SCREEN_REGISTRY)
    ).toEqual([]);
  });

  it.each([
    ['export', 'data-privacy'],
    ['scopes', 'connections'],
    ['legibility', 'account'],
  ])('finds the user job %s', (query, id) => {
    expect(
      filterSettingsAdmissions(SETTINGS_ADMISSION_GROUPS, query).flatMap(
        group => group.items.map(item => item.id)
      )
    ).toEqual([id]);
  });

  it('preserves consent, account controls and meaningful manual overrides', () => {
    expect(getSettingsAdmission('connections').scope).toBe('account');
    const items = SETTINGS_ADMISSION_GROUPS.flatMap(group => group.items);
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
    const groups = SETTINGS_ADMISSION_GROUPS.map(group => ({
      ...group,
      items: group.items.map(item =>
        item.id === 'connections'
          ? { ...item, admission: { ...item.admission, ...change } }
          : item
      ),
    }));
    expect(
      validateSettingsAdmission(
        groups as typeof SETTINGS_ADMISSION_GROUPS,
        APP_SCREEN_REGISTRY
      ).map(issue => issue.code)
    ).toContain(code);
  });

  it('rejects duplicate navigation identities and orphaned routes', () => {
    const first = SETTINGS_ADMISSION_GROUPS[0];
    const groups = [
      ...SETTINGS_ADMISSION_GROUPS,
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
    const privacy = SETTINGS_ADMISSION_GROUPS.flatMap(
      group => group.items
    ).find(item => item.id === 'data-privacy');
    expect(privacy).toBeDefined();
    if (!privacy) throw new Error('Missing live privacy destination');
    const alias = {
      ...privacy,
      id: 'delete-account',
      href: APP_ROUTES.SETTINGS_DELETE_ACCOUNT,
    };
    const groups = [{ id: 'alias', label: 'Alias', items: [alias] }];
    expect(validateSettingsAdmission(groups, APP_SCREEN_REGISTRY)).toEqual([]);
    const invalid = [
      {
        ...groups[0],
        items: [
          {
            ...alias,
            admission: { ...alias.admission, canonicalRoute: alias.href },
          },
        ],
      },
    ];
    expect(
      validateSettingsAdmission(invalid, APP_SCREEN_REGISTRY).map(
        issue => issue.code
      )
    ).toContain('canonical-screen-mismatch');
  });
});
