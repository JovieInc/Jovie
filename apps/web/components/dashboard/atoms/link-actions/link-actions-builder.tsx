import type { ContextMenuItemType } from '@/components/organisms/table';

export interface BuildLinkActionsCallbacks {
  readonly onEdit?: () => void;
  readonly onToggle: () => void;
  readonly onRemove: () => void;
}

export interface BuildLinkActionsOptions {
  readonly isVisible: boolean;
  readonly callbacks: BuildLinkActionsCallbacks;
}

/**
 * Canonical builder for link action menus.
 *
 * Returns `ContextMenuItemType[]` that works with:
 * - Ellipsis action button dropdown (existing)
 * - Right-click context menu (new)
 */
export function buildLinkActions({
  isVisible,
  callbacks,
}: BuildLinkActionsOptions): ContextMenuItemType[] {
  const items: ContextMenuItemType[] = [];

  if (callbacks.onEdit) {
    items.push({
      id: 'edit',
      label: 'Edit',
      onClick: callbacks.onEdit,
    });
  }

  items.push({
    id: 'toggle',
    label: isVisible ? 'Hide' : 'Show',
    onClick: callbacks.onToggle,
  });

  items.push(
    { type: 'separator' },
    {
      id: 'remove',
      label: 'Delete',
      onClick: callbacks.onRemove,
      destructive: true,
    }
  );

  return items;
}
