import { Icon } from '@/components/atoms/Icon';
import type { ContextMenuItemType } from '@/components/organisms/table';
import type { TourDateViewModel } from '@/lib/tour-dates/types';

export interface BuildTourDateActionsCallbacks {
  readonly onEdit: (tourDate: TourDateViewModel) => void;
  readonly onDelete: (id: string) => void;
}

/**
 * Canonical builder for tour date action menus.
 *
 * Returns `ContextMenuItemType[]` that works with:
 * - Right-click context menus (via `TableContextMenu`)
 * - Ellipsis action button dropdowns (via `convertContextMenuItems`)
 * - Sidebar overflow menus (via `convertToCommonDropdownItems`)
 *
 * Note: Save is intentionally excluded — it is a primary sidebar button, not a menu action.
 */
export function buildTourDateActions(
  tourDate: TourDateViewModel,
  callbacks: BuildTourDateActionsCallbacks
): ContextMenuItemType[] {
  const items: ContextMenuItemType[] = [
    {
      id: 'edit',
      label: 'Edit',
      icon: <Icon name='PencilLine' className='h-4 w-4' />,
      onClick: () => callbacks.onEdit(tourDate),
    },
  ];

  // ── Navigation group ──
  if (tourDate.ticketUrl) {
    items.push({
      id: 'open-tickets',
      label: 'Open ticket link',
      icon: <Icon name='ExternalLink' className='h-4 w-4' />,
      onClick: () =>
        globalThis.open(tourDate.ticketUrl!, '_blank', 'noopener,noreferrer'),
    });
  }

  // ── Destructive group ──
  items.push(
    { type: 'separator' },
    {
      id: 'delete',
      label: 'Delete',
      icon: <Icon name='Trash2' className='h-4 w-4' />,
      onClick: () => callbacks.onDelete(tourDate.id),
      destructive: true,
    }
  );

  return items;
}
