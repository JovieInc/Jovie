'use client';

import { Button } from '@jovie/ui';
import { UserPlus } from 'lucide-react';
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { DrawerToggleButton } from '@/components/dashboard/atoms/DrawerToggleButton';
import type { EditableContact } from '@/components/dashboard/hooks/useContactsManager';
import { useTableMeta } from '@/components/organisms/AuthShellWrapper';
import { EmptyState } from '@/components/organisms/EmptyState';
import { UnifiedTable } from '@/components/organisms/table';
import { useHeaderActions } from '@/contexts/HeaderActionsContext';
import { SIDEBAR_WIDTH, TABLE_MIN_WIDTHS } from '@/lib/constants/layout';
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

  const isSidebarOpen = Boolean(selectedContact);

  // Connect to tableMeta for drawer toggle button
  const { setTableMeta } = useTableMeta();

  // Use ref to avoid infinite loop - contacts array reference changes each render
  const contactsRef = useRef(contacts);
  contactsRef.current = contacts;

  useEffect(() => {
    // Toggle function: close if open, open first contact if closed
    const toggle = () => {
      if (selectedContact) {
        setSelectedContact(null);
      } else if (contactsRef.current.length > 0) {
        setSelectedContact(contactsRef.current[0]);
      }
    };

    setTableMeta({
      rowCount: contacts.length,
      toggle: contacts.length > 0 ? toggle : null,
      rightPanelWidth: isSidebarOpen ? SIDEBAR_WIDTH : 0,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- setTableMeta is a stable context setter
  }, [selectedContact, contacts.length, isSidebarOpen]);

  // Set header actions (drawer toggle on right)
  const { setHeaderActions } = useHeaderActions();

  // Memoize drawer toggle to avoid creating new JSX on every render
  const drawerToggle = useMemo(() => <DrawerToggleButton />, []);

  useEffect(() => {
    setHeaderActions(drawerToggle);

    return () => {
      setHeaderActions(null);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- setHeaderActions is a stable context setter
  }, [drawerToggle]);

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
          <div className='shrink-0 flex items-center justify-between border-t border-subtle px-4 py-2'>
            <span className='text-xs text-secondary-token tracking-wide'>
              {contacts.length} {contacts.length === 1 ? 'contact' : 'contacts'}
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
