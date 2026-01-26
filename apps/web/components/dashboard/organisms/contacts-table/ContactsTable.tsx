'use client';

import { Button } from '@jovie/ui';
import { UserPlus } from 'lucide-react';
import { memo, useCallback, useMemo, useState } from 'react';
import type { EditableContact } from '@/components/dashboard/hooks/useContactsManager';
import { EmptyState } from '@/components/organisms/EmptyState';
import { UnifiedTable } from '@/components/organisms/table';
import { TABLE_MIN_WIDTHS } from '@/lib/constants/layout';
import type { ContactRole } from '@/types/contacts';
import { ContactDetailSidebar } from './ContactDetailSidebar';
import { createContactColumns } from './columns';

interface ContactsTableProps {
  contacts: EditableContact[];
  artistName: string;
  onUpdate: (id: string, updates: Partial<EditableContact>) => void;
  onSave: (contact: EditableContact) => Promise<void>;
  onDelete: (contact: EditableContact) => Promise<void>;
  onAddContact: (role?: ContactRole) => void;
}

export const ContactsTable = memo(function ContactsTable({
  contacts,
  artistName,
  onUpdate,
  onSave,
  onDelete,
  onAddContact,
}: ContactsTableProps) {
  const [selectedContact, setSelectedContact] =
    useState<EditableContact | null>(null);

  const columns = useMemo(() => createContactColumns(), []);

  const handleRowClick = useCallback((contact: EditableContact) => {
    setSelectedContact(contact);
  }, []);

  const handleClose = useCallback(() => {
    setSelectedContact(null);
  }, []);

  const handleUpdate = useCallback(
    (updates: Partial<EditableContact>) => {
      if (!selectedContact) return;
      onUpdate(selectedContact.id, updates);
      // Update local selected contact state
      setSelectedContact(prev => (prev ? { ...prev, ...updates } : null));
    },
    [selectedContact, onUpdate]
  );

  const handleSave = useCallback(async () => {
    if (!selectedContact) return;
    await onSave(selectedContact);
  }, [selectedContact, onSave]);

  const handleDelete = useCallback(async () => {
    if (!selectedContact) return;
    await onDelete(selectedContact);
    setSelectedContact(null);
  }, [selectedContact, onDelete]);

  const getRowClassName = useCallback(
    (contact: EditableContact) => {
      return selectedContact?.id === contact.id
        ? 'bg-surface-2'
        : 'hover:bg-surface-2/50';
    },
    [selectedContact]
  );

  const isEmpty = contacts.length === 0;

  return (
    <div className='flex h-full min-h-0 flex-row' data-testid='contacts-table'>
      {/* Main content area */}
      <div className='flex-1 min-h-0 min-w-0 flex flex-col overflow-hidden'>
        <h1 className='sr-only'>Contacts</h1>
        <p className='sr-only'>
          Manage bookings, management, and press contacts for {artistName}
        </p>

        <div className='flex-1 min-h-0 flex flex-col bg-surface-1'>
          {/* Scrollable content area */}
          <div className='flex-1 min-h-0 overflow-auto'>
            {isEmpty ? (
              <EmptyState
                icon={<UserPlus className='h-6 w-6' aria-hidden='true' />}
                heading='No contacts yet'
                description='Add bookings, management, and press contacts so fans and industry know who to reach.'
                action={{
                  label: 'Add bookings contact',
                  onClick: () => onAddContact('bookings'),
                }}
                secondaryAction={{
                  label: 'Add management contact',
                  onClick: () => onAddContact('management'),
                }}
              />
            ) : (
              <UnifiedTable
                data={contacts}
                columns={columns}
                isLoading={false}
                getRowId={contact => contact.id}
                minWidth={`${TABLE_MIN_WIDTHS.MEDIUM}px`}
                className='text-[13px]'
                getRowClassName={getRowClassName}
                onRowClick={handleRowClick}
              />
            )}
          </div>

          {/* Footer - only show when not empty */}
          {!isEmpty && (
            <div className='shrink-0 flex items-center justify-between border-t border-subtle bg-surface-1 px-4 py-2'>
              <span className='text-xs text-secondary-token tracking-wide'>
                {contacts.length}{' '}
                {contacts.length === 1 ? 'contact' : 'contacts'}
              </span>
              <Button
                variant='secondary'
                size='sm'
                onClick={() => onAddContact()}
              >
                Add contact
              </Button>
            </div>
          )}
        </div>
      </div>

      {/* Right sidebar */}
      <ContactDetailSidebar
        contact={selectedContact}
        isOpen={Boolean(selectedContact)}
        onClose={handleClose}
        onUpdate={handleUpdate}
        onSave={handleSave}
        onDelete={handleDelete}
      />
    </div>
  );
});
