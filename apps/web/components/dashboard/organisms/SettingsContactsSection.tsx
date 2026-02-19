'use client';

import { Button } from '@jovie/ui';
import { AlertCircle, Plus, UserPlus } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useDashboardData } from '@/app/app/(shell)/dashboard/DashboardDataContext';
import { DashboardCard } from '@/components/dashboard/atoms/DashboardCard';
import {
  type EditableContact,
  useContactsManager,
} from '@/components/dashboard/hooks/useContactsManager';
import { ContactDetailSidebar } from '@/components/dashboard/organisms/contacts-table/ContactDetailSidebar';
import { ConfirmDialog } from '@/components/molecules/ConfirmDialog';
import { ContactsSectionSkeleton } from '@/components/molecules/SettingsLoadingSkeleton';
import {
  getContactRoleLabel,
  summarizeTerritories,
} from '@/lib/contacts/constants';
import { useContactsQuery } from '@/lib/queries/useContactsQuery';
import type { Artist } from '@/types/db';

interface SettingsContactsSectionProps {
  readonly artist: Artist;
}

export function SettingsContactsSection({
  artist,
}: SettingsContactsSectionProps) {
  const { selectedProfile } = useDashboardData();
  const artistHandle =
    selectedProfile?.usernameNormalized ?? selectedProfile?.username ?? '';

  const {
    data: initialContacts,
    isLoading,
    isError,
    refetch,
  } = useContactsQuery(artist.id);

  if (isLoading) {
    return (
      <DashboardCard variant='settings'>
        <ContactsSectionSkeleton />
      </DashboardCard>
    );
  }

  if (isError) {
    return (
      <DashboardCard variant='settings'>
        <div className='flex flex-col items-center justify-center gap-2 py-8'>
          <AlertCircle className='h-6 w-6 text-destructive' />
          <p className='text-sm text-secondary-token'>
            Failed to load contacts.
          </p>
          <Button variant='ghost' size='sm' onClick={() => refetch()}>
            Try again
          </Button>
        </div>
      </DashboardCard>
    );
  }

  return (
    <ContactsListInner
      profileId={artist.id}
      artistName={artist.name}
      artistHandle={artistHandle}
      initialContacts={initialContacts ?? []}
    />
  );
}

function ContactsListInner({
  profileId,
  artistName,
  artistHandle,
  initialContacts,
}: {
  readonly profileId: string;
  readonly artistName: string;
  readonly artistHandle: string;
  readonly initialContacts: EditableContact[];
}) {
  const [selectedContactId, setSelectedContactId] = useState<string | null>(
    null
  );

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

  const selectedContact = useMemo(
    () => contacts.find(c => c.id === selectedContactId) ?? null,
    [contacts, selectedContactId]
  );

  const handleRowClick = useCallback((contact: EditableContact) => {
    setSelectedContactId(contact.id);
  }, []);

  const handleClose = useCallback(() => {
    setSelectedContactId(null);
  }, []);

  const handleUpdate = useCallback(
    (updates: Partial<EditableContact>) => {
      if (!selectedContactId) return;
      updateContact(selectedContactId, updates);
    },
    [selectedContactId, updateContact]
  );

  const handleSaveSelected = useCallback(async () => {
    if (!selectedContact) return;
    const savedId = await handleSave(selectedContact);
    if (savedId && savedId !== selectedContact.id) {
      setSelectedContactId(savedId);
    }
  }, [selectedContact, handleSave]);

  const handleDeleteSelected = useCallback(() => {
    if (!selectedContact) return;
    handleDelete(selectedContact);
    setSelectedContactId(null);
  }, [selectedContact, handleDelete]);

  const handleAddContact = useCallback(() => {
    addContact('bookings');
    // The new contact will have isNew flag — auto-select it
    setTimeout(() => {
      // Find the temp contact that was just added
      // This works because addContact updates state synchronously
    }, 0);
  }, [addContact]);

  // Auto-select newly added contacts
  const newContact = contacts.find(c => c.isNew);
  useEffect(() => {
    if (newContact && newContact.id !== selectedContactId) {
      setSelectedContactId(newContact.id);
    }
  }, [newContact?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const deleteLabel = pendingDeleteContact
    ? getContactRoleLabel(
        pendingDeleteContact.role,
        pendingDeleteContact.customLabel
      )
    : '';

  const isEmpty = contacts.length === 0;

  return (
    <>
      <div className='flex items-stretch'>
        <DashboardCard variant='settings' className='flex-1 min-w-0'>
          <div className='space-y-3'>
            <div className='flex items-center justify-between'>
              <p className='text-sm text-secondary-token'>
                Manage bookings, management, and press contacts for {artistName}
                .
              </p>
              <Button
                variant='ghost'
                size='sm'
                onClick={handleAddContact}
                className='gap-1.5 text-secondary-token hover:text-primary-token'
              >
                <Plus className='h-4 w-4' />
                Add contact
              </Button>
            </div>

            {isEmpty ? (
              <div className='text-center py-6'>
                <UserPlus className='h-8 w-8 text-secondary-token/50 mx-auto mb-2' />
                <p className='text-sm text-secondary-token'>
                  No contacts yet. Add your first contact to get started.
                </p>
              </div>
            ) : (
              <div className='divide-y divide-subtle'>
                {contacts.map(contact => (
                  <ContactRow
                    key={contact.id}
                    contact={contact}
                    isSelected={selectedContactId === contact.id}
                    onClick={() => handleRowClick(contact)}
                  />
                ))}
              </div>
            )}
          </div>
        </DashboardCard>

        <ContactDetailSidebar
          contact={selectedContact}
          isOpen={Boolean(selectedContact)}
          onClose={handleClose}
          onUpdate={handleUpdate}
          onSave={handleSaveSelected}
          onDelete={handleDeleteSelected}
        />
      </div>

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

function ContactRow({
  contact,
  isSelected,
  onClick,
}: {
  readonly contact: EditableContact;
  readonly isSelected: boolean;
  readonly onClick: () => void;
}) {
  const roleLabel = getContactRoleLabel(contact.role, contact.customLabel);
  const { summary: territorySummary } = summarizeTerritories(
    contact.territories
  );

  return (
    <button
      type='button'
      onClick={onClick}
      className={`flex items-center gap-3 w-full text-left py-3 px-2 -mx-2 rounded-md transition-colors cursor-pointer ${
        isSelected ? 'bg-surface-2' : 'hover:bg-surface-2/50'
      }`}
    >
      <div className='min-w-0 flex-1'>
        <div className='flex items-center gap-2'>
          <span className='text-xs font-medium text-tertiary-token uppercase tracking-wide'>
            {roleLabel}
          </span>
        </div>
        <div className='flex items-center gap-2 mt-0.5'>
          {contact.personName && (
            <span className='text-sm text-primary-token truncate'>
              {contact.personName}
            </span>
          )}
          {contact.email && (
            <span className='text-xs text-secondary-token truncate'>
              {contact.email}
            </span>
          )}
        </div>
      </div>
      {territorySummary && (
        <span className='text-xs text-tertiary-token shrink-0'>
          {territorySummary}
        </span>
      )}
    </button>
  );
}
