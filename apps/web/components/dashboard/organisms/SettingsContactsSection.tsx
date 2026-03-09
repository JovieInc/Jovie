'use client';

import { Badge, Button } from '@jovie/ui';
import { Plus, UserPlus } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useDashboardData } from '@/app/app/(shell)/dashboard/DashboardDataContext';
import { DashboardCard } from '@/components/dashboard/atoms/DashboardCard';
import {
  type EditableContact,
  useContactsManager,
} from '@/components/dashboard/hooks/useContactsManager';
import { SettingsErrorState } from '@/components/dashboard/molecules/SettingsErrorState';
import { ContactDetailSidebar } from '@/components/dashboard/organisms/contacts-table/ContactDetailSidebar';
import { ConfirmDialog } from '@/components/molecules/ConfirmDialog';
import { ContactsSectionSkeleton } from '@/components/molecules/SettingsLoadingSkeleton';
import { useRegisterRightPanel } from '@/hooks/useRegisterRightPanel';
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
      <SettingsErrorState
        message='Failed to load contacts.'
        onRetry={() => refetch()}
      />
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
  const isSidebarOpen = Boolean(selectedContact);

  const sidebarPanel = useMemo(
    () => (
      <ContactDetailSidebar
        contact={selectedContact}
        isOpen={isSidebarOpen}
        onClose={handleClose}
        onUpdate={handleUpdate}
        onSave={handleSaveSelected}
        onDelete={handleDeleteSelected}
      />
    ),
    [
      selectedContact,
      isSidebarOpen,
      handleClose,
      handleUpdate,
      handleSaveSelected,
      handleDeleteSelected,
    ]
  );

  useRegisterRightPanel(sidebarPanel);

  return (
    <>
      <DashboardCard variant='settings'>
        <div className='space-y-3'>
          <div className='flex items-center justify-between'>
            <p className='text-[13px] text-secondary-token'>
              Manage bookings, management, and press contacts for {artistName}.
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
              <p className='text-[13px] text-secondary-token'>
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
        isSelected ? 'bg-white/[0.04]' : 'hover:bg-white/[0.02]'
      }`}
    >
      <div className='min-w-0 flex-1'>
        <div className='flex items-center gap-2'>
          <span className='text-[11px] font-[510] text-tertiary-token uppercase tracking-[0.08em]'>
            {roleLabel}
          </span>
        </div>
        <div className='flex items-center gap-2 mt-0.5'>
          {contact.personName && (
            <span className='text-[13px] text-primary-token truncate'>
              {contact.personName}
            </span>
          )}
          {contact.email && (
            <span className='text-[11px] text-secondary-token truncate'>
              {contact.email}
            </span>
          )}
        </div>
      </div>
      {territorySummary && (
        <Badge size='sm' className='shrink-0'>
          {territorySummary}
        </Badge>
      )}
    </button>
  );
}
