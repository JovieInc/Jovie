'use client';

import { Trash2 } from 'lucide-react';
import type { EditableContact } from '@/components/dashboard/hooks/useContactsManager';
import type { ContextMenuItemType } from '@/components/organisms/table';
import { buildCopyMenuItems } from '@/components/ui/CopyableField';

export interface ContactRowActionCallbacks {
  readonly onDelete: (contact: EditableContact) => void;
}

export function getContactRowContextMenuItems(
  contact: EditableContact,
  callbacks: ContactRowActionCallbacks
): ContextMenuItemType[] {
  const copyItems = buildCopyMenuItems([
    contact.email
      ? { id: 'email', label: 'Email', value: contact.email }
      : null,
    contact.phone
      ? { id: 'phone', label: 'Phone', value: contact.phone }
      : null,
  ]);

  const items: ContextMenuItemType[] = [...copyItems];

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
