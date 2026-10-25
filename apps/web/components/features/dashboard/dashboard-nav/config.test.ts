import { describe, expect, it } from 'vitest';
import { APP_ROUTES } from '@/constants/routes';
import {
  artistNavigation,
  artistSettingsNavigation,
  audienceNavItem,
  CUSTOMER_NAV_CAPACITY,
  calendarNavItem,
  canonicalSidebarNavigation,
  chatNavItem,
  contactsNavItem,
  desktopMoreNavigation,
  desktopPrimaryNavigation,
  homeNavItem,
  inboxNavItem,
  linksNavItem,
  mobileExpandedNavigation,
  mobilePrimaryNavigation,
  partitionCustomerNavigation,
  paymentsNavItem,
  primaryNavigation,
  settingsNavItem,
  settingsNavigation,
  tasksNavItem,
  userSettingsNavigation,
} from './config';

const CANONICAL_NAVIGATION = [
  ['home', 'Home', APP_ROUTES.DASHBOARD],
  ['presence', 'Identity', APP_ROUTES.PRESENCE],
  ['library', 'Work', APP_ROUTES.LIBRARY],
  ['audience', 'Audience', APP_ROUTES.CONTACTS_AUDIENCE],
] as const;

function toContract(
  items: readonly { id: string; name: string; href: string }[]
) {
  return items.map(item => [item.id, item.name, item.href]);
}

describe('canonical customer shell navigation', () => {
  it('binds the live profile settings row to the canonical route', () => {
    const profile = artistSettingsNavigation.find(
      item => item.id === 'artist-profile'
    );
    expect(profile).toMatchObject({
      name: 'Profile',
      href: APP_ROUTES.SETTINGS_PROFILE,
    });
    expect(
      settingsNavigation.filter(item => item.id === 'artist-profile')
    ).toEqual([profile]);
    expect(APP_ROUTES.SETTINGS_ARTIST_PROFILE).toBe(
      APP_ROUTES.SETTINGS_PROFILE
    );
  });

  it('keeps the four job-level roots in the DESIGN.md order', () => {
    expect(toContract(primaryNavigation)).toEqual(CANONICAL_NAVIGATION);
    expect(toContract(canonicalSidebarNavigation)).toEqual(
      CANONICAL_NAVIGATION
    );
    expect(primaryNavigation.every(item => item.tier === 'core')).toBe(true);
  });

  it('detects missing and reordered canonical destinations', () => {
    expect(toContract(primaryNavigation.slice(0, -1))).not.toEqual(
      CANONICAL_NAVIGATION
    );
    expect(toContract([...primaryNavigation].reverse())).not.toEqual(
      CANONICAL_NAVIGATION
    );
  });

  it('keeps entity categories out of contextual root overflow by default', () => {
    expect(artistNavigation).toEqual([]);
  });

  it('derives mobile primary + More destinations from the capacity partition', () => {
    const partition = partitionCustomerNavigation(primaryNavigation, {
      visibleCap: CUSTOMER_NAV_CAPACITY.mobilePrimaryVisible,
    });

    expect(mobilePrimaryNavigation).toEqual(partition.visible);
    expect(mobileExpandedNavigation.slice(0, partition.more.length)).toEqual(
      partition.more
    );

    for (const [index, item] of [
      ...mobilePrimaryNavigation,
      ...partition.more,
    ].entries()) {
      expect(item).toBe(primaryNavigation[index]);
    }

    expect(mobileExpandedNavigation.slice(partition.more.length)).toEqual(
      artistNavigation
    );
  });

  it('keeps the full approved core set on desktop with no More overflow', () => {
    expect(desktopPrimaryNavigation.map(item => item.id)).toEqual(
      primaryNavigation.map(item => item.id)
    );
    expect(desktopMoreNavigation).toEqual([]);
    expect(primaryNavigation.length).toBeLessThanOrEqual(
      CUSTOMER_NAV_CAPACITY.desktopPrimaryVisible
    );
  });

  it('keeps entity taxonomies and retired workflows out of root navigation', () => {
    const ids = primaryNavigation.map(item => item.id);
    const labels = primaryNavigation.map(item => item.name);

    for (const id of [
      'calendar',
      'chat',
      'contacts',
      'events',
      'links',
      'products',
      'releases',
      'tasks',
      'videos',
    ]) {
      expect(ids).not.toContain(id);
    }
    for (const label of [
      'Calendar',
      'Contacts',
      'Events',
      'Library',
      'Links',
      'Products',
      'Releases',
      'Tasks',
      'Videos',
    ]) {
      expect(labels).not.toContain(label);
    }

    // Removed roots remain addressable for contextual links and old bookmarks.
    expect(APP_ROUTES.TOUR_DATES).toBe('/app/tour-dates');
    expect(APP_ROUTES.RELEASES).toBe('/app/releases');
    expect(APP_ROUTES.TASKS).toBe('/app/tasks');
    expect(APP_ROUTES.LIBRARY).toBe('/app/library');
    expect(APP_ROUTES.CALENDAR).toBe('/app/calendar');
  });
});

// ---------------------------------------------------------------------------
// Nav IA naming guard (ds-cert:nav-ia-naming)
//
// docs/design-system/rail-registry.json is not on main yet, so the allowed
// names live in this local constant. Every label the customer navigation
// renders must resolve to one of these sentence-case names.
// ---------------------------------------------------------------------------

const ALLOWED_NAV_LABELS = [
  'Account',
  'Analytics',
  'Audience',
  'Audience & tracking',
  'Billing & subscription',
  'Calendar',
  'Chat',
  'Connections',
  'Contacts',
  'Data & privacy',
  'Home',
  'Identity',
  'Inbox',
  'Links',
  'Payments',
  'Profile',
  'Referral',
  'Settings',
  'Touring',
  'Usage stats',
  'Work',
] as const;

/** Labels retired by the nav IA naming rule; they must never come back. */
const RETIRED_NAV_LABELS = [
  'New Chat',
  'Usage Stats',
  'Billing & Subscription',
  'Data & Privacy',
  'Audience & Tracking',
] as const;

/** Every nav item this config exports, across all navigation contexts. */
const ALL_NAV_ITEMS = [
  inboxNavItem,
  chatNavItem,
  homeNavItem,
  ...primaryNavigation,
  contactsNavItem,
  linksNavItem,
  audienceNavItem,
  calendarNavItem,
  tasksNavItem,
  settingsNavItem,
  paymentsNavItem,
  ...userSettingsNavigation,
  ...artistSettingsNavigation,
];

/**
 * Items that co-render in one rail: the Inbox attention row, the Chat create
 * row, the primary roots, and the Settings row. Duplicate labels here are
 * the duplicate-row defect this guard exists to catch.
 */
const ROOT_RAIL_ITEMS = [
  ...new Map(
    [inboxNavItem, chatNavItem, settingsNavItem, ...primaryNavigation].map(
      item => [item.id, item]
    )
  ).values(),
];

describe('nav IA naming guard (ds-cert:nav-ia-naming)', () => {
  it('renders only allowed sentence-case nav labels', () => {
    for (const item of ALL_NAV_ITEMS) {
      expect(
        ALLOWED_NAV_LABELS,
        `label "${item.name}" (id: ${item.id}) must be in the allowed nav names list`
      ).toContain(item.name);
    }
  });

  it('never resurrects a retired label', () => {
    const labels = ALL_NAV_ITEMS.map(item => item.name);
    for (const retired of RETIRED_NAV_LABELS) {
      expect(labels).not.toContain(retired);
    }
  });

  it('keeps labels unique across the co-rendered root rail', () => {
    const labels = ROOT_RAIL_ITEMS.map(item => item.name);
    expect(new Set(labels).size).toBe(labels.length);

    const ids = ROOT_RAIL_ITEMS.map(item => item.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('keeps labels unique within each exported navigation set', () => {
    for (const [name, items] of [
      ['primaryNavigation', primaryNavigation],
      ['settingsNavigation', settingsNavigation],
      ['userSettingsNavigation', userSettingsNavigation],
      ['artistSettingsNavigation', artistSettingsNavigation],
      ['mobileExpandedNavigation', mobileExpandedNavigation],
    ] as const) {
      const labels = items.map(item => item.name);
      expect(new Set(labels).size, `${name} must not repeat a label`).toBe(
        labels.length
      );
    }
  });
});
