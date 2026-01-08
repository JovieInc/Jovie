'use client';

import { Button } from '@jovie/ui';
import { DashboardCard } from '@/components/dashboard/atoms/DashboardCard';
import { useContactsManager } from '@/components/dashboard/hooks/useContactsManager';
import { ContactItem } from '@/components/dashboard/molecules/ContactItem';
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

  const {
    contacts,
    hasContacts,
    updateContact,
    handleToggleTerritory,
    addCustomTerritory,
    handleSave,
    handleDelete,
    handleCancel,
    addContact,
  } = useContactsManager({
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
    <div className='space-y-4' data-testid='contacts-manager'>
      <h1 className='sr-only'>Contacts</h1>
      <p className='text-secondary-token'>
        Add bookings, management, and press contacts so fans and industry know
        who to reach for {artistName}.
      </p>

      {!hasContacts && (
        <DashboardCard variant='empty-state'>
          <div className='space-y-3'>
            <p className='text-secondary-token'>
              Get started with your first contact.
            </p>
            <div className='flex flex-wrap gap-2'>
              <Button size='sm' onClick={() => addContact('bookings')}>
                Add bookings contact
              </Button>
              <Button
                size='sm'
                variant='secondary'
                onClick={() => addContact('management')}
              >
                Add management contact
              </Button>
            </div>
          </div>
        </DashboardCard>
      )}

      {hasContacts && (
        <div className='space-y-3'>
          {contacts.map(contact => (
            <ContactItem
              key={contact.id}
              contact={contact}
              onUpdate={updates => updateContact(contact.id, updates)}
              onToggleTerritory={territory =>
                handleToggleTerritory(contact.id, territory)
              }
              onAddCustomTerritory={() => addCustomTerritory(contact.id)}
              onSave={() => handleSave(contact)}
              onCancel={() => handleCancel(contact)}
              onDelete={() => handleDelete(contact)}
            />
          ))}
        </div>
      )}

      <div>
        <Button
          variant='primary'
          onClick={() => addContact()}
          className='min-h-[44px] w-full sm:w-auto'
        >
          Add contact
        </Button>
      </div>
    </div>
  );
}
