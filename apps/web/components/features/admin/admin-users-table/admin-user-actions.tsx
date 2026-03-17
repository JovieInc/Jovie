'use client';

import { Copy, ExternalLink } from 'lucide-react';
import type { ContextMenuItemType } from '@/components/organisms/table';
import type { AdminUserRow } from '@/lib/admin/users';

// Module-level icon constants — allocated once, reused across all rows and renders.
const ICON_COPY = <Copy className='h-3.5 w-3.5' />;
const ICON_EXTERNAL = <ExternalLink className='h-3.5 w-3.5' />;

export interface BuildAdminUserActionsCallbacks {
  readonly onCopyClerkId: (user: AdminUserRow) => void;
  readonly onCopyEmail: (user: AdminUserRow) => void;
  readonly onCopyUserId: (user: AdminUserRow) => void;
  readonly onOpenInClerk: (user: AdminUserRow) => void;
}

/**
 * Canonical builder for admin user action menus.
 *
 * Returns `ContextMenuItemType[]` that works with:
 * - Right-click context menus (via `TableContextMenu`)
 * - Ellipsis action button dropdowns (via `convertContextMenuItems`)
 * - Sidebar overflow menus (via `convertToCommonDropdownItems`)
 */
export function buildAdminUserActions(
  user: AdminUserRow,
  callbacks: BuildAdminUserActionsCallbacks
): ContextMenuItemType[] {
  const items: ContextMenuItemType[] = [
    // ── Copy group ──
    {
      id: 'copy-clerk-id',
      label: 'Copy Clerk user ID',
      icon: ICON_COPY,
      onClick: () => callbacks.onCopyClerkId(user),
    },
    {
      id: 'copy-email',
      label: 'Copy email',
      icon: ICON_COPY,
      onClick: () => callbacks.onCopyEmail(user),
      disabled: !user.email,
    },
    {
      id: 'copy-user-id',
      label: 'Copy User ID',
      icon: ICON_COPY,
      onClick: () => callbacks.onCopyUserId(user),
    },
  ];

  // ── External links group ──
  if (user.clerkId.length > 0) {
    items.push(
      { type: 'separator' as const },
      {
        id: 'open-in-clerk',
        label: 'Open in Clerk',
        icon: ICON_EXTERNAL,
        onClick: () => callbacks.onOpenInClerk(user),
      }
    );
  }

  return items;
}
