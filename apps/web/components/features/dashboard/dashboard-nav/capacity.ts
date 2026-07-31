import type { CustomerNavTier, NavItem } from './types';

/**
 * Documented capacity for the founder-approved customer primary rail (JOV-4515).
 *
 * Core destinations always take priority. Experimental destinations may fill
 * remaining slots under the cap; extras share one canonical More menu.
 * This is a transitional safety valve — not permission to expand permanent IA.
 */
export const CUSTOMER_NAV_CAPACITY = {
  /**
   * Desktop sidebar direct rows. Sized to the approved core set so every core
   * destination stays on the rail; experimental extras overflow into More.
   */
  desktopPrimaryVisible: 7,
  /**
   * Mobile bottom-bar direct tabs. Remaining destinations (core that do not
   * fit + experimental extras) share the single More menu.
   */
  mobilePrimaryVisible: 3,
} as const;

export type CustomerNavCapacityBreakpoint = keyof typeof CUSTOMER_NAV_CAPACITY;

export interface CustomerNavPartition {
  readonly visible: readonly NavItem[];
  readonly more: readonly NavItem[];
}

export interface PartitionCustomerNavigationOptions {
  /** Max destinations rendered as direct primary rows/tabs. */
  readonly visibleCap: number;
  /**
   * Active destination id. When set, the active item is always kept in
   * `visible` (promoted out of More if needed) so the active route is never
   * hidden from the primary rail/tabs.
   */
  readonly activeItemId?: string | null;
}

function navTier(item: NavItem): CustomerNavTier {
  return item.tier ?? 'core';
}

function sortBySourceOrder(
  items: readonly NavItem[],
  source: readonly NavItem[]
): NavItem[] {
  const order = new Map(source.map((item, index) => [item.id, index]));
  return [...items].sort(
    (a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0)
  );
}

/**
 * Partition customer navigation into direct-visible vs one shared More menu.
 *
 * Rules:
 * 1. Core destinations fill visible slots first.
 * 2. Experimental destinations fill remaining slots under the cap.
 * 3. Everything else goes into a single More list (no route-specific overflow).
 * 4. When `activeItemId` is provided and would land in More, promote it into
 *    visible (displacing the last experimental, else the last visible item).
 */
export function partitionCustomerNavigation(
  items: readonly NavItem[],
  { visibleCap, activeItemId = null }: PartitionCustomerNavigationOptions
): CustomerNavPartition {
  if (visibleCap < 0) {
    throw new Error('visibleCap must be >= 0');
  }

  if (items.length === 0 || visibleCap === 0) {
    return {
      visible: activeItemId
        ? items.filter(item => item.id === activeItemId).slice(0, 1)
        : [],
      more: activeItemId
        ? items.filter(item => item.id !== activeItemId)
        : [...items],
    };
  }

  const core: NavItem[] = [];
  const experimental: NavItem[] = [];
  for (const item of items) {
    if (navTier(item) === 'experimental') {
      experimental.push(item);
    } else {
      core.push(item);
    }
  }

  const visible: NavItem[] = [];
  const more: NavItem[] = [];

  for (const item of core) {
    if (visible.length < visibleCap) {
      visible.push(item);
    } else {
      more.push(item);
    }
  }

  for (const item of experimental) {
    if (visible.length < visibleCap) {
      visible.push(item);
    } else {
      more.push(item);
    }
  }

  if (activeItemId) {
    const activeInVisible = visible.some(item => item.id === activeItemId);
    const activeInMoreIndex = more.findIndex(item => item.id === activeItemId);

    if (!activeInVisible && activeInMoreIndex >= 0) {
      const [activeItem] = more.splice(activeInMoreIndex, 1);
      if (activeItem) {
        if (visible.length >= visibleCap) {
          let displaceIndex = -1;
          for (let index = visible.length - 1; index >= 0; index -= 1) {
            if (navTier(visible[index]!) === 'experimental') {
              displaceIndex = index;
              break;
            }
          }
          if (displaceIndex < 0) {
            displaceIndex = visible.length - 1;
          }
          const [displaced] = visible.splice(displaceIndex, 1);
          if (displaced) {
            more.push(displaced);
          }
        }
        visible.push(activeItem);
      }
    }
  }

  return {
    visible: sortBySourceOrder(visible, items),
    more: sortBySourceOrder(more, items),
  };
}

/** Resolve the visible cap for a named breakpoint. */
export function customerNavVisibleCap(
  breakpoint: CustomerNavCapacityBreakpoint
): number {
  return CUSTOMER_NAV_CAPACITY[breakpoint];
}
