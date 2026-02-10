'use client';

import { Button } from '@jovie/ui';
import { Plus, UserPlus } from 'lucide-react';
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { DrawerToggleButton } from '@/components/dashboard/atoms/DrawerToggleButton';
import type { EditableContact } from '@/components/dashboard/hooks/useContactsManager';
import { useTableMeta } from '@/components/organisms/AuthShellWrapper';
import { EmptyState } from '@/components/organisms/EmptyState';
import { UnifiedTable } from '@/components/organisms/table';
import { useSetHeaderActions } from '@/contexts/HeaderActionsContext';
import { SIDEBAR_WIDTH, TABLE_MIN_WIDTHS } from '@/lib/constants/layout';
import type { ContactRole } from '@/types/contacts';
import { ContactDetailSidebar } from './ContactDetailSidebar';
import { createContactColumns } from './columns';

interface ContactsTableProps {
  readonly contacts: EditableContact[];
  readonly artistName: string;
  readonly onUpdate: (id: string, updates: Partial<EditableContact>) => void;
  readonly onSave: (contact: EditableContact) => Promise<string | undefined>;
  readonly onDelete: (contact: EditableContact) => void;
  readonly onAddContact: (role?: ContactRole) => void;
}

export const ContactsTable = memo(function ContactsTable({
  contacts,
  artistName,
  onUpdate,
  onSave,
  onDelete,
  onAddContact,
}: ContactsTableProps) {
  const [selectedContactId, setSelectedContactId] = useState<string | null>(
    null
  );

  // Derive selectedContact from contacts array to stay in sync after saves
  const selectedContact = useMemo(
    () => contacts.find(c => c.id === selectedContactId) ?? null,
    [contacts, selectedContactId]
  );

  // Auto-select newly added contacts using the isNew flag
  useEffect(() => {
    const newContact = contacts.find(c => c.isNew);
    if (newContact) {
      setSelectedContactId(newContact.id);
    }
  }, [contacts]);

  const columns = useMemo(() => createContactColumns({ onDelete }), [onDelete]);

  const isSidebarOpen = Boolean(selectedContact);

  // Connect to tableMeta for drawer toggle button
  const { setTableMeta } = useTableMeta();

  // Use ref to avoid infinite loop - contacts array reference changes each render
  const contactsRef = useRef(contacts);
  contactsRef.current = contacts;

  useEffect(() => {
    // Toggle function: close if open, open first contact if closed
    const toggle = () => {
      if (selectedContactId) {
        setSelectedContactId(null);
      } else if (contactsRef.current.length > 0) {
        setSelectedContactId(contactsRef.current[0].id);
      }
    };

    setTableMeta({
      rowCount: contacts.length,
      toggle: contacts.length > 0 ? toggle : null,
      rightPanelWidth: isSidebarOpen ? SIDEBAR_WIDTH : 0,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- setTableMeta is a stable context setter
  }, [selectedContactId, contacts.length, isSidebarOpen]);

  // Set header actions (add contact button + drawer toggle on right)
  const { setHeaderActions } = useSetHeaderActions();

  // Use ref for onAddContact to keep header actions stable
  const onAddContactRef = useRef(onAddContact);
  onAddContactRef.current = onAddContact;

  // Memoize header actions to avoid creating new JSX on every render
  const headerActions = useMemo(
    () => (
      <div className='flex items-center gap-1'>
        <Button
          variant='ghost'
          size='sm'
          onClick={() => onAddContactRef.current()}
          className='gap-1.5 text-secondary-token hover:text-primary-token'
        >
          <Plus className='h-3.5 w-3.5' />
          <span className='hidden sm:inline'>Add contact</span>
        </Button>
        <DrawerToggleButton />
      </div>
    ),
    []
  );

  useEffect(() => {
    setHeaderActions(headerActions);

    return () => {
      setHeaderActions(null);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- setHeaderActions is a stable context setter
  }, [headerActions]);

  const handleRowClick = useCallback((contact: EditableContact) => {
    setSelectedContactId(contact.id);
  }, []);

  const handleClose = useCallback(() => {
    setSelectedContactId(null);
  }, []);

  const handleUpdate = useCallback(
    (updates: Partial<EditableContact>) => {
      if (!selectedContactId) return;
      onUpdate(selectedContactId, updates);
    },
    [selectedContactId, onUpdate]
  );

  const handleSave = useCallback(async () => {
    if (!selectedContact) return;
    const savedId = await onSave(selectedContact);
    // Update selection if the contact ID changed (temp → persisted)
    if (savedId && savedId !== selectedContact.id) {
      setSelectedContactId(savedId);
    }
  }, [selectedContact, onSave]);

  const handleDelete = useCallback(() => {
    if (!selectedContact) return;
    onDelete(selectedContact);
  }, [selectedContact, onDelete]);

  const getRowClassName = useCallback(
    (contact: EditableContact) => {
      // Selected row: solid bg with slightly deeper hover (override base hover:bg-surface-2/50)
      return selectedContactId === contact.id
        ? 'bg-surface-2 hover:bg-surface-2'
        : '';
    },
    [selectedContactId]
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

        {/* Footer - contact count */}
        {!isEmpty && (
          <div className='shrink-0 flex items-center border-t border-subtle px-4 py-1.5'>
            <span className='text-xs text-tertiary-token tabular-nums'>
              {contacts.length} {contacts.length === 1 ? 'contact' : 'contacts'}
            </span>
          </div>
        )}
      </div>

      {/* Right sidebar */}
      <ContactDetailSidebar
        contact={selectedContact}
        isOpen={isSidebarOpen}
        onClose={handleClose}
        onUpdate={handleUpdate}
        onSave={handleSave}
        onDelete={handleDelete}
      />
    </div>
  );
});
