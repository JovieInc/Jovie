'use client';

import { Trash2 } from 'lucide-react';
import type { EditableContact } from '@/components/dashboard/hooks/useContactsManager';
import type { ContextMenuItemType } from '@/components/organisms/table';
import { buildCopyMenuItems } from '@/components/ui/CopyableField';

export interface BuildContactActionsCallbacks {
  readonly onDelete: (contact: EditableContact) => void;
}

/**
 * Canonical builder for contact action menus.
 *
 * Returns `ContextMenuItemType[]` that works with:
 * - Right-click context menus (via `TableContextMenu`)
 * - Ellipsis action button dropdowns (via `convertContextMenuItems`)
 * - Sidebar overflow menus (via `convertToCommonDropdownItems`)
 */
export function buildContactActions(
  contact: EditableContact,
  callbacks: BuildContactActionsCallbacks
): ContextMenuItemType[] {
  // ── Copy group ──
  const copyItems = buildCopyMenuItems([
    contact.email
      ? { id: 'email', label: 'Email', value: contact.email }
      : null,
    contact.phone
      ? { id: 'phone', label: 'Phone', value: contact.phone }
      : null,
  ]);

  const items: ContextMenuItemType[] = [...copyItems];

  // ── Destructive group ──
  if (copyItems.length > 0) {
    items.push({ type: 'separator' });
  }

  items.push({
    id: 'delete',
    label: 'Delete contact',
    icon: <Trash2 className='h-3.5 w-3.5' />,
    destructive: true,
    onClick: () => callbacks.onDelete(contact),
  });

  return items;
}
