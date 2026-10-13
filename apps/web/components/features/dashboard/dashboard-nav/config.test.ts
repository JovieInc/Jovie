import { describe, expect, it } from 'vitest';
import { APP_ROUTES } from '@/constants/routes';
import {
  artistNavigation,
  artistSettingsNavigation,
  CUSTOMER_NAV_CAPACITY,
  canonicalSidebarNavigation,
  desktopMoreNavigation,
  desktopPrimaryNavigation,
  mobileExpandedNavigation,
  mobilePrimaryNavigation,
  partitionCustomerNavigation,
  primaryNavigation,
  settingsNavigation,
} from './config';

const CANONICAL_NAVIGATION = [
  ['home', 'Inbox', APP_ROUTES.DASHBOARD],
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
