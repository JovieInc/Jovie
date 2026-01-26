'use client';

import { DashboardCard } from '@/components/dashboard/atoms/DashboardCard';
import { useContactsManager } from '@/components/dashboard/hooks/useContactsManager';
import { ContactsTable } from '@/components/dashboard/organisms/contacts-table';
import { STATSIG_FLAGS } from '@/lib/flags';
import { useFeatureGate } from '@/lib/flags/client';
import type { DashboardContact } from '@/types/contacts';

export interface ContactsManagerProps {
  profileId: string;
  artistName: string;
  artistHandle: string;
  initialContacts: DashboardContact[];
}

export function ContactsManager({
  profileId,
  artistName,
  artistHandle,
  initialContacts,
}: ContactsManagerProps) {
  const gate = useFeatureGate(STATSIG_FLAGS.CONTACTS);
  const featureEnabled = gate.value;

  const { contacts, updateContact, handleSave, handleDelete, addContact } =
    useContactsManager({
      profileId,
      artistHandle,
      initialContacts,
    });

  if (!featureEnabled) {
    return (
      <DashboardCard variant='settings'>
        <h1 className='text-xl font-semibold text-primary-token'>
          Contacts coming soon
        </h1>
        <p className='text-secondary-token mt-1'>
          This workspace does not have the contacts preview enabled yet.
        </p>
      </DashboardCard>
    );
  }

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
