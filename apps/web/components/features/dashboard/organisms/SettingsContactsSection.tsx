'use client';

import { Button } from '@jovie/ui';
import { Plus, UserPlus } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useDashboardData } from '@/app/app/(shell)/dashboard/DashboardDataContext';
import { SettingsPanel } from '@/components/features/dashboard/molecules/SettingsPanel';
import { ContentSurfaceCard } from '@/components/molecules/ContentSurfaceCard';
import { ContactsSectionSkeleton } from '@/components/molecules/SettingsLoadingSkeleton';
import { UsageLimitUpgradePrompt } from '@/components/molecules/UsageLimitUpgradePrompt';
import { useContactsManager } from '@/features/dashboard/hooks/useContactsManager';
import { ContactDeleteConfirmDialog } from '@/features/dashboard/molecules/ContactDeleteConfirmDialog';
import { ContactListRow } from '@/features/dashboard/molecules/ContactListRow';
import { SettingsErrorState } from '@/features/dashboard/molecules/SettingsErrorState';
import { ContactDetailSidebar } from '@/features/dashboard/organisms/contacts-table/ContactDetailSidebar';
import { useRegisterRightPanel } from '@/hooks/useRegisterRightPanel';
import { useContactsQuery, usePlanGate } from '@/lib/queries';
import type { EditableContact } from '@/types/contacts';
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
      <SettingsPanel
        title='Team Contacts'
        description={`Manage bookings, management, and press contacts for ${artist.name}.`}
      >
        <div className='px-4 py-4 sm:px-5'>
          <ContactsSectionSkeleton />
        </div>
      </SettingsPanel>
    );
  }

  if (isError) {
    return (
      <SettingsPanel
        title='Team Contacts'
        description={`Manage bookings, management, and press contacts for ${artist.name}.`}
      >
        <div className='px-4 py-4 sm:px-5'>
          <SettingsErrorState
            title='Unable To Load Contacts'
            message='Failed to load contacts.'
            onRetry={() => {
              void refetch();
            }}
          />
        </div>
      </SettingsPanel>
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
  }, [addContact]);

  // Auto-select newly added contacts
  const newContactId = contacts.find(c => c.isNew)?.id ?? null;
  useEffect(() => {
    if (newContactId && newContactId !== selectedContactId) {
      setSelectedContactId(newContactId);
    }
  }, [newContactId, selectedContactId]);

  const { contactsLimit } = usePlanGate();
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
      <SettingsPanel
        title='Team Contacts'
        description={`Manage bookings, management, and press contacts for ${artistName}.`}
        actions={
          <Button
            variant='ghost'
            size='sm'
            onClick={handleAddContact}
            className='gap-1.5 text-secondary-token hover:text-primary-token'
          >
            <Plus className='h-4 w-4' aria-hidden />
            Add Contact
          </Button>
        }
      >
        <div className='px-4 py-4 sm:px-5'>
          {isEmpty ? (
            <ContentSurfaceCard className='flex flex-col items-center justify-center gap-2 bg-surface-0 px-6 py-10 text-center'>
              <UserPlus className='h-8 w-8 text-tertiary-token' aria-hidden />
              <p className='text-app text-secondary-token'>
                No contacts yet. Add your first contact to get started.
              </p>
            </ContentSurfaceCard>
          ) : (
            <div className='space-y-1'>
              {contacts.map(contact => (
                <ContactListRow
                  key={contact.id}
                  contact={contact}
                  isSelected={selectedContactId === contact.id}
                  onClick={() => handleRowClick(contact)}
                />
              ))}
            </div>
          )}
          {contactsLimit !== null && (
            <UsageLimitUpgradePrompt
              current={contacts.length}
              limit={contactsLimit}
              featureName='contacts'
              upgradeCopy='unlimited contacts'
              className='mt-3'
            />
          )}
        </div>
      </SettingsPanel>

      <ContactDeleteConfirmDialog
        contact={pendingDeleteContact}
        onConfirm={confirmDelete}
        onCancel={cancelDelete}
      />
    </>
  );
}
