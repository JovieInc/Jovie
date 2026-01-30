'use client';

import { useContactsManager } from '@/components/dashboard/hooks/useContactsManager';
import { ContactsTable } from '@/components/dashboard/organisms/contacts-table';
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
  const { contacts, updateContact, handleSave, handleDelete, addContact } =
    useContactsManager({
      profileId,
      artistHandle,
      initialContacts,
    });

  return (
    <ContactsTable
      contacts={contacts}
      artistName={artistName}
      onUpdate={updateContact}
      onSave={handleSave}
      onDelete={handleDelete}
      onAddContact={addContact}
    />
  );
}
