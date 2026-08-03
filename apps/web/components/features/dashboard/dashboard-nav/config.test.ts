import { describe, expect, it } from 'vitest';
import { APP_ROUTES } from '@/constants/routes';
import {
  artistNavigation,
  CUSTOMER_NAV_CAPACITY,
  desktopMoreNavigation,
  desktopPrimaryNavigation,
  mobileExpandedNavigation,
  mobilePrimaryNavigation,
  partitionCustomerNavigation,
  primaryNavigation,
} from './config';

const CANONICAL_NAVIGATION = [
  ['chat', 'New Chat', APP_ROUTES.CHAT],
  ['inbox', 'Inbox', APP_ROUTES.DASHBOARD],
] as const;

const ARTIST_NAVIGATION = [
  ['library', 'Library', APP_ROUTES.LIBRARY],
  ['contacts', 'Contacts', APP_ROUTES.CONTACTS],
  ['calendar', 'Calendar', APP_ROUTES.CALENDAR],
  ['profiles', 'Presence', APP_ROUTES.PROFILES],
] as const;

function toContract(
  items: readonly { id: string; name: string; href: string }[]
) {
  return items.map(item => [item.id, item.name, item.href]);
}

describe('canonical customer shell navigation', () => {
  it('keeps New Chat as the quiet secondary first action and Connections in the canonical order', () => {
    expect(toContract(primaryNavigation)).toEqual(CANONICAL_NAVIGATION);
    expect(primaryNavigation[0].tone).toBe('secondary');
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

  it('keeps artist-scoped destinations together for the artist group shell', () => {
    expect(toContract(artistNavigation)).toEqual(ARTIST_NAVIGATION);
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

  it('excludes retired primary destinations while preserving contextual Task routes', () => {
    const ids = primaryNavigation.map(item => item.id);
    const labels = primaryNavigation.map(item => item.name);

    expect(ids).not.toEqual(
      expect.arrayContaining([
        'search',
        'touring',
        'audience',
        'releases',
        'tasks',
      ])
    );
    expect(labels).not.toEqual(
      expect.arrayContaining([
        'Search',
        'Touring',
        'Audience',
        'Releases',
        'Tasks',
      ])
    );
    expect(APP_ROUTES.TOUR_DATES).toBe('/app/tour-dates');
    expect(APP_ROUTES.AUDIENCE).toBe('/app/audience');
    expect(APP_ROUTES.PROFILES).toBe('/app/profiles');
    expect(APP_ROUTES.RELEASES).toBe('/app/releases');
    expect(APP_ROUTES.TASKS).toBe('/app/tasks');
  });
});
