'use client';

import { useContactsManager } from '@/components/dashboard/hooks/useContactsManager';
import { ContactsTable } from '@/components/dashboard/organisms/contacts-table';
import { ConfirmDialog } from '@/components/molecules/ConfirmDialog';
import { getContactRoleLabel } from '@/lib/contacts/constants';
import type { DashboardContact } from '@/types/contacts';

export interface ContactsManagerProps {
  readonly profileId: string;
  readonly artistName: string;
  readonly artistHandle: string;
  readonly initialContacts: DashboardContact[];
}

export function ContactsManager({
  profileId,
  artistName,
  artistHandle,
  initialContacts,
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

  const deleteLabel = pendingDeleteContact
    ? getContactRoleLabel(
        pendingDeleteContact.role,
        pendingDeleteContact.customLabel
      )
    : '';

  return (
    <>
      <ContactsTable
        contacts={contacts}
        artistName={artistName}
        onUpdate={updateContact}
        onSave={handleSave}
        onDelete={handleDelete}
        onAddContact={addContact}
      />

      <ConfirmDialog
        open={Boolean(pendingDeleteContact)}
        onOpenChange={open => {
          if (!open) cancelDelete();
        }}
        title='Delete contact'
        description={`Remove the "${deleteLabel}" contact from your profile? This action cannot be undone.`}
        confirmLabel='Delete'
        variant='destructive'
        onConfirm={confirmDelete}
      />
    </>
  );
}
