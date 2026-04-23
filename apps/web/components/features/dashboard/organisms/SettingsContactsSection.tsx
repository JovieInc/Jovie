'use client';

import { Badge, Button } from '@jovie/ui';
import { Plus, UserPlus } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useDashboardData } from '@/app/app/(shell)/dashboard/DashboardDataContext';
import { SettingsPanel } from '@/components/features/dashboard/molecules/SettingsPanel';
import { ConfirmDialog } from '@/components/molecules/ConfirmDialog';
import { ContentSurfaceCard } from '@/components/molecules/ContentSurfaceCard';
import { ContactsSectionSkeleton } from '@/components/molecules/SettingsLoadingSkeleton';
import { UsageLimitUpgradePrompt } from '@/components/molecules/UsageLimitUpgradePrompt';
import {
  type EditableContact,
  useContactsManager,
} from '@/features/dashboard/hooks/useContactsManager';
import { ContactDetailSidebar } from '@/features/dashboard/organisms/contacts-table/ContactDetailSidebar';
import { useRegisterRightPanel } from '@/hooks/useRegisterRightPanel';
import {
  getContactRoleLabel,
  summarizeTerritories,
} from '@/lib/contacts/constants';
import { useContactsQuery, usePlanGate } from '@/lib/queries';
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
        title='Team contacts'
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
        title='Team contacts'
        description={`Manage bookings, management, and press contacts for ${artist.name}.`}
      >
        <div className='px-4 py-4 sm:px-5'>
          <ContentSurfaceCard className='flex flex-col items-center justify-center gap-2 bg-surface-0 px-6 py-8 text-center'>
            <UserPlus className='h-8 w-8 text-tertiary-token' aria-hidden />
            <p className='text-app text-secondary-token'>
              Failed to load contacts.
            </p>
            <Button variant='ghost' size='sm' onClick={() => refetch()}>
              Try again
            </Button>
          </ContentSurfaceCard>
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

  const deleteLabel = pendingDeleteContact
    ? getContactRoleLabel(
        pendingDeleteContact.role,
        pendingDeleteContact.customLabel
      )
    : '';

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
        title='Team contacts'
        description={`Manage bookings, management, and press contacts for ${artistName}.`}
        actions={
          <Button
            variant='ghost'
            size='sm'
            onClick={handleAddContact}
            className='gap-1.5 text-secondary-token hover:text-primary-token'
          >
            <Plus className='h-4 w-4' aria-hidden />
            Add contact
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
                <ContactRow
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
      aria-pressed={isSelected}
      className={`flex w-full items-center gap-3 rounded-lg border px-3 py-3 text-left transition-[background-color,border-color,box-shadow] duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--linear-border-focus)/35 ${
        isSelected
          ? 'border-subtle bg-surface-0'
          : 'border-transparent hover:bg-surface-0'
      }`}
    >
      <div className='min-w-0 flex-1'>
        <div className='flex items-center gap-2'>
          <span className='text-app font-[510] text-secondary-token tracking-normal'>
            {roleLabel}
          </span>
        </div>
        <div className='flex items-center gap-2 mt-0.5'>
          {contact.personName && (
            <span className='text-app text-primary-token truncate'>
              {contact.personName}
            </span>
          )}
          {contact.email && (
            <span className='text-2xs text-secondary-token truncate'>
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
