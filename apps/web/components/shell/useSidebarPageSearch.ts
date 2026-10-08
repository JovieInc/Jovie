'use client';

import { useCallback } from 'react';
import { useSidebar } from '@/components/organisms/sidebar';
import { useHeaderActions } from '@/contexts/HeaderActionsContext';
import type { NavItem } from '@/features/dashboard/dashboard-nav/types';
import type { NavCommand } from '@/lib/commands/registry';
import { isAvailable } from './useRailFocusReturn';

/** Search only the already-permitted registry supplied by the workspace owner. */
export function useSidebarPageSearch(items: readonly NavItem[]) {
  const { openPageSearch } = useHeaderActions();
  const { isMobile, setOpenMobile } = useSidebar();
  return useCallback(() => {
    const pages: NavCommand[] = items
      .flatMap(item => [item, ...(item.children ?? [])])
      .map(item => ({
        kind: 'nav',
        id: item.id,
        label: item.name,
        description: item.description ?? '',
        iconName: item.iconName ?? 'Search',
        surfaces: ['cmdk'],
        href: item.href,
      }));
    // Radix temporarily aria-hides the permanent header while a Sheet is open.
    // Its surviving trigger is the return target, rather than the drawer button.
    const returnFocus = Array.from(
      document.querySelectorAll<HTMLElement>('[data-rail-toggle="left"]')
    ).find(element =>
      isMobile
        ? !element.closest('[data-mobile="true"]') &&
          element.getClientRects().length > 0
        : isAvailable(element)
    );
    if (isMobile) setOpenMobile(false);
    requestAnimationFrame(() => openPageSearch(pages, returnFocus));
  }, [items, isMobile, openPageSearch, setOpenMobile]);
}
