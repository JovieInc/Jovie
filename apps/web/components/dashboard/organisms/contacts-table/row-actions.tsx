'use client';

import { Copy, Trash2 } from 'lucide-react';
import type { EditableContact } from '@/components/dashboard/hooks/useContactsManager';
import type { ContextMenuItemType } from '@/components/organisms/table';

export interface ContactRowActionCallbacks {
  readonly onDelete: (contact: EditableContact) => void;
  readonly onCopyToClipboard: (text: string, label: string) => void;
}

export function getContactRowContextMenuItems(
  contact: EditableContact,
  callbacks: ContactRowActionCallbacks
): ContextMenuItemType[] {
  const items: ContextMenuItemType[] = [];

  if (contact.email) {
    items.push({
      id: 'copy-email',
      label: 'Copy email',
      icon: <Copy className='h-3.5 w-3.5' />,
      onClick: () => callbacks.onCopyToClipboard(contact.email!, 'Email'),
    });
  }

  if (contact.phone) {
    items.push({
      id: 'copy-phone',
      label: 'Copy phone',
      icon: <Copy className='h-3.5 w-3.5' />,
      onClick: () => callbacks.onCopyToClipboard(contact.phone!, 'Phone'),
    });
  }

  if (items.length > 0) {
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
