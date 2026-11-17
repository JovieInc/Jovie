'use client';

// @coverage-via apps/web/tests/unit/components/organisms/UnifiedSidebar.library.test.tsx

import { SidebarMenu } from '@/components/organisms/sidebar';
import { NavMenuItem } from '@/features/dashboard/dashboard-nav/NavMenuItem';
import type { NavItem } from '@/features/dashboard/dashboard-nav/types';

/** Shared eager navigation group; Settings search and logout load separately. */
export function SettingsNavGroup({
  items,
  pathname,
  isItemActive,
  onPrefetch,
}: Readonly<{
  items: readonly NavItem[];
  pathname: string;
  isItemActive?: (item: NavItem) => boolean;
  onPrefetch?: (item: NavItem) => void;
}>) {
  return (
    <SidebarMenu>
      {items.map(item => {
        const isActive =
          isItemActive?.(item) ??
          (pathname === item.href || pathname.startsWith(`${item.href}/`));
        return (
          <NavMenuItem
            key={item.id}
            item={item}
            isActive={isActive}
            calm
            onPrefetch={onPrefetch ? () => onPrefetch(item) : undefined}
          />
        );
      })}
    </SidebarMenu>
  );
}
