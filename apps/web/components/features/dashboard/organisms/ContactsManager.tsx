'use client';

import { NavigationDestinationReady } from '@/components/features/dashboard/NavigationDestinationReady';
import { useContactsManager } from '@/features/dashboard/hooks/useContactsManager';
import { ContactDeleteConfirmDialog } from '@/features/dashboard/molecules/ContactDeleteConfirmDialog';
import { ContactsTable } from '@/features/dashboard/organisms/contacts-table';
import type { DashboardContact } from '@/types/contacts';

export interface ContactsManagerProps {
  readonly profileId: string;
  readonly artistName: string;
  readonly artistHandle: string;
  readonly initialContacts: DashboardContact[];
  readonly isLoading?: boolean;
}

export function ContactsManager({
  profileId,
  artistName,
  artistHandle,
  initialContacts,
  isLoading = false,
}: ContactsManagerProps) {
  const {
    contacts,
    updateContact,
    handleSave,
    handleDelete,
    confirmDelete,
    cancelDelete,
    pendingDeleteContact,
    addContact,
  } = useContactsManager({
    profileId,
    artistHandle,
    initialContacts,
  });

  return (
    <>
      <NavigationDestinationReady destination='contacts' ready={!isLoading} />
      <ContactsTable
        contacts={contacts}
        artistName={artistName}
        isLoading={isLoading}
        onUpdate={updateContact}
        onSave={handleSave}
        onDelete={handleDelete}
        onAddContact={addContact}
      />

      <ContactDeleteConfirmDialog
        contact={pendingDeleteContact}
        onConfirm={confirmDelete}
        onCancel={cancelDelete}
      />
    </>
  );
}
