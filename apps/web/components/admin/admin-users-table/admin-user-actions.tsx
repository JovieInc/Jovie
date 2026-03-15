import { Copy, ExternalLink } from 'lucide-react';
import { toast } from 'sonner';
import type { ContextMenuItemType } from '@/components/organisms/table';
import { copyToClipboard } from '@/hooks/useClipboard';
import type { AdminUserRow } from '@/lib/admin/users';

/**
 * Canonical builder for admin user action menus.
 *
 * Returns `ContextMenuItemType[]` that works with:
 * - Right-click context menus (via `TableContextMenu`)
 * - Ellipsis action button dropdowns (via `convertContextMenuItems`)
 * - Drawer overflow menus (via `convertToCommonDropdownItems`)
 * - Drawer right-click (via `RightDrawer.contextMenuItems`)
 */
export function buildAdminUserActions(
  user: AdminUserRow
): ContextMenuItemType[] {
  const items: ContextMenuItemType[] = [];

  items.push(
    {
      id: 'copy-clerk-id',
      label: 'Copy Clerk user ID',
      icon: <Copy className='h-3.5 w-3.5' />,
      onClick: () => {
        copyToClipboard(user.clerkId).then(ok => {
          if (ok) {
            toast.success('Clerk ID copied', { duration: 2000 });
          } else {
            toast.error('Failed to copy Clerk ID');
          }
        });
      },
    },
    {
      id: 'copy-email',
      label: 'Copy email',
      icon: <Copy className='h-3.5 w-3.5' />,
      onClick: () => {
        if (user.email) {
          copyToClipboard(user.email).then(ok => {
            if (ok) {
              toast.success('Email copied', { duration: 2000 });
            } else {
              toast.error('Failed to copy email');
            }
          });
        }
      },
      disabled: !user.email,
    },
    {
      id: 'copy-user-id',
      label: 'Copy User ID',
      icon: <Copy className='h-3.5 w-3.5' />,
      onClick: () => {
        copyToClipboard(user.id).then(ok => {
          if (ok) {
            toast.success('User ID copied', { duration: 2000 });
          } else {
            toast.error('Failed to copy User ID');
          }
        });
      },
    }
  );

  // Open in Clerk (if has Clerk ID)
  if (user.clerkId.length > 0) {
    const clerkConsoleUrl = `https://dashboard.clerk.com/apps/users/user_${encodeURIComponent(user.clerkId)}`;
    items.push(
      { type: 'separator' as const },
      {
        id: 'open-in-clerk',
        label: 'Open in Clerk',
        icon: <ExternalLink className='h-3.5 w-3.5' />,
        onClick: () => {
          globalThis.open(clerkConsoleUrl, '_blank', 'noopener,noreferrer');
        },
      }
    );
  }

  return items;
}
