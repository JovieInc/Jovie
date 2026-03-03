import { describe, expect, it, vi } from 'vitest';
import type { EditableContact } from '@/components/dashboard/hooks/useContactsManager';
import { getContactRowContextMenuItems } from '@/components/dashboard/organisms/contacts-table/row-actions';

const baseContact: EditableContact = {
  id: 'contact-1',
  role: 'bookings',
  customLabel: null,
  personName: 'Taylor Artist',
  companyName: 'North Star',
  email: null,
  phone: null,
  territories: ['Worldwide'],
  preferredChannel: null,
  sortOrder: 0,
  isNew: false,
  creatorProfileId: 'profile-1',
  isActive: true,
};

describe('getContactRowContextMenuItems', () => {
  it('returns copy and delete actions when contact has email and phone', () => {
    const onDelete = vi.fn();
    const onCopyToClipboard = vi.fn();
    const contact: EditableContact = {
      ...baseContact,
      email: 'hello@jov.ie',
      phone: '+1 555 0100',
    };

    const items = getContactRowContextMenuItems(contact, {
      onDelete,
      onCopyToClipboard,
    });

    expect(items.map(item => ('id' in item ? item.id : item.type))).toEqual([
      'copy-email',
      'copy-phone',
      'separator',
      'delete',
    ]);
  });

  it('returns only delete action when contact has no email or phone', () => {
    const onDelete = vi.fn();
    const onCopyToClipboard = vi.fn();

    const items = getContactRowContextMenuItems(baseContact, {
      onDelete,
      onCopyToClipboard,
    });

    expect(items.map(item => ('id' in item ? item.id : item.type))).toEqual([
      'delete',
    ]);
  });
});
