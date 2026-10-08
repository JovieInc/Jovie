import { CalendarDays, CheckSquare, Music, SquarePen } from 'lucide-react';
import { describe, expect, it } from 'vitest';
import { APP_ROUTES } from '@/constants/routes';
import {
  CUSTOMER_NAV_CAPACITY,
  customerNavVisibleCap,
  partitionCustomerNavigation,
  partitionCustomerSidebarNavigation,
} from './capacity';
import {
  artistNavigation,
  calendarNavItem,
  mobileExpandedNavigation,
  mobilePrimaryNavigation,
  navigationVisibleForFlags,
  primaryNavigation,
} from './config';
import type { NavItem } from './types';

function experimentalItem(id: string, name: string): NavItem {
  return {
    id,
    name,
    href: `/app/${id}`,
    icon: Music,
    tier: 'experimental',
  };
}

describe('CUSTOMER_NAV_CAPACITY', () => {
  it('documents desktop and mobile caps that preserve the approved core rail', () => {
    expect(CUSTOMER_NAV_CAPACITY.desktopPrimaryVisible).toBe(4);
    expect(CUSTOMER_NAV_CAPACITY.mobilePrimaryVisible).toBe(3);
    expect(customerNavVisibleCap('desktopPrimaryVisible')).toBe(4);
    expect(customerNavVisibleCap('mobilePrimaryVisible')).toBe(3);
  });

  it('requires every approved core destination to fit the desktop rail', () => {
    const coreItems = primaryNavigation.filter(
      item => (item.tier ?? 'core') === 'core'
    );
    expect(coreItems).toHaveLength(primaryNavigation.length);
    expect(coreItems.length).toBeLessThanOrEqual(
      CUSTOMER_NAV_CAPACITY.desktopPrimaryVisible
    );
  });
});

describe('partitionCustomerNavigation', () => {
  it('keeps the default mobile primary + More split in source order', () => {
    const partition = partitionCustomerNavigation(primaryNavigation, {
      visibleCap: CUSTOMER_NAV_CAPACITY.mobilePrimaryVisible,
    });

    expect(partition.visible.map(item => item.id)).toEqual([
      'home',
      'presence',
      'library',
    ]);
    expect(partition.more.map(item => item.id)).toEqual(['audience']);
    expect(partition.visible).toEqual(mobilePrimaryNavigation);
    expect(mobileExpandedNavigation).toEqual([
      ...partition.more,
      ...artistNavigation,
    ]);
  });

  it('keeps the full approved core set on the desktop rail with an empty More', () => {
    const partition = partitionCustomerNavigation(primaryNavigation, {
      visibleCap: CUSTOMER_NAV_CAPACITY.desktopPrimaryVisible,
    });

    expect(partition.visible.map(item => item.id)).toEqual(
      primaryNavigation.map(item => item.id)
    );
    expect(partition.more).toEqual([]);
  });

  it('overflows only experimental extras after the cap into one More list', () => {
    const items: NavItem[] = [
      ...primaryNavigation,
      experimentalItem('labs', 'Labs'),
      experimentalItem('signals', 'Signals'),
    ];

    const partition = partitionCustomerNavigation(items, {
      visibleCap: primaryNavigation.length + 1,
    });

    expect(partition.visible.map(item => item.id)).toEqual([
      ...primaryNavigation.map(item => item.id),
      'labs',
    ]);
    expect(partition.more.map(item => item.id)).toEqual(['signals']);
    expect(partition.more.every(item => item.tier === 'experimental')).toBe(
      true
    );
  });

  it('fills remaining desktop slots with experimental items before overflowing', () => {
    const coreSlice = primaryNavigation.slice(0, 2);
    const items: NavItem[] = [
      ...coreSlice,
      experimentalItem('labs', 'Labs'),
      experimentalItem('signals', 'Signals'),
    ];

    const partition = partitionCustomerNavigation(items, {
      visibleCap: CUSTOMER_NAV_CAPACITY.desktopPrimaryVisible,
    });

    expect(partition.visible.map(item => item.id)).toEqual([
      ...coreSlice.map(item => item.id),
      'labs',
      'signals',
    ]);
    expect(partition.more).toEqual([]);
  });

  it('keeps the stable three-item mobile strip when no route is active', () => {
    const partition = partitionCustomerNavigation(primaryNavigation, {
      visibleCap: CUSTOMER_NAV_CAPACITY.mobilePrimaryVisible,
      activeItemId: null,
    });

    expect(partition.visible).toHaveLength(
      CUSTOMER_NAV_CAPACITY.mobilePrimaryVisible
    );
    expect(partition.visible.map(item => item.id)).toEqual([
      'home',
      'presence',
      'library',
    ]);
  });

  it('promotes an active experimental destination ahead of passive experimental slots', () => {
    const items: NavItem[] = [
      {
        id: 'chat',
        name: 'New Chat',
        href: APP_ROUTES.CHAT,
        icon: SquarePen,
        tier: 'core',
      },
      {
        id: 'library',
        name: 'Library',
        href: APP_ROUTES.LIBRARY,
        icon: Music,
        tier: 'core',
      },
      {
        id: 'calendar',
        name: 'Calendar',
        href: APP_ROUTES.CALENDAR,
        icon: CalendarDays,
        tier: 'core',
      },
      experimentalItem('labs', 'Labs'),
      experimentalItem('signals', 'Signals'),
      {
        id: 'tasks',
        name: 'Tasks',
        href: APP_ROUTES.TASKS,
        icon: CheckSquare,
        tier: 'experimental',
      },
    ];

    const partition = partitionCustomerNavigation(items, {
      visibleCap: 4,
      activeItemId: 'tasks',
    });

    expect(partition.visible.map(item => item.id)).toEqual([
      'chat',
      'library',
      'calendar',
      'tasks',
    ]);
    expect(partition.more.map(item => item.id)).toEqual(['labs', 'signals']);
  });

  it('preserves object identity from the source list', () => {
    const partition = partitionCustomerNavigation(primaryNavigation, {
      visibleCap: 3,
      activeItemId: 'audience',
    });

    for (const item of [...partition.visible, ...partition.more]) {
      expect(primaryNavigation.find(source => source.id === item.id)).toBe(
        item
      );
    }
  });
});

describe('fixed customer sidebar roots', () => {
  it('retains root order and sends a new authorized destination to More even when a root is flag-denied', () => {
    const registry = [calendarNavItem, ...primaryNavigation].reverse();
    const allowed = navigationVisibleForFlags(registry, {
      PROFILES_WORKSPACE: false,
    });
    const partition = partitionCustomerSidebarNavigation(allowed);
    expect(partition.visible.map(item => item.id)).toEqual([
      'home',
      'library',
      'audience',
    ]);
    expect(partition.more.map(item => item.id)).toEqual(['calendar']);
    expect(
      [...partition.visible, ...partition.more].some(
        item => item.id === 'presence'
      )
    ).toBe(false);
    const enabled = partitionCustomerSidebarNavigation(
      navigationVisibleForFlags(registry, { PROFILES_WORKSPACE: true })
    );
    expect(enabled.visible.map(item => item.id)).toEqual([
      'home',
      'presence',
      'library',
      'audience',
    ]);
    expect(enabled.more.map(item => item.id)).toEqual(['calendar']);
  });
});
