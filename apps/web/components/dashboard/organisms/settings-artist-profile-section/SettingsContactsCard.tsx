'use client';

import { Button } from '@jovie/ui';
import { Pencil, Plus, UserPlus } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { DashboardCard } from '@/components/dashboard/atoms/DashboardCard';
import {
  type EditableContact,
  useContactsManager,
} from '@/components/dashboard/hooks/useContactsManager';
import { ContactDetailSidebar } from '@/components/dashboard/organisms/contacts-table/ContactDetailSidebar';
import { ConfirmDialog } from '@/components/molecules/ConfirmDialog';
import { getContactRoleLabel } from '@/lib/contacts/constants';
import { cn } from '@/lib/utils';
import type { DashboardContact } from '@/types/contacts';

interface SettingsContactsCardProps {
  readonly profileId: string;
  readonly artistName: string;
  readonly artistHandle: string;
  readonly initialContacts: DashboardContact[];
}

function getContactDetail(contact: EditableContact): string {
  const personName = contact.personName?.trim();
  const email = contact.email?.trim();
  const phone = contact.phone?.trim();

  return personName || email || phone || 'No contact info added';
}

export function SettingsContactsCard({
  profileId,
  artistName,
  artistHandle,
  initialContacts,
}: SettingsContactsCardProps) {
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

  const [selectedContactId, setSelectedContactId] = useState<string | null>(
    null
  );

  const selectedContact = useMemo(
    () => contacts.find(contact => contact.id === selectedContactId) ?? null,
    [contacts, selectedContactId]
  );

  useEffect(() => {
    const newContact = contacts.find(contact => contact.isNew);
    if (newContact) {
      setSelectedContactId(newContact.id);
    }
  }, [contacts]);

  useEffect(() => {
    if (
      selectedContactId &&
      !contacts.some(contact => contact.id === selectedContactId)
    ) {
      setSelectedContactId(null);
    }
  }, [contacts, selectedContactId]);

  const handleOpenEditor = useCallback((contactId: string) => {
    setSelectedContactId(contactId);
  }, []);

  const handleCloseEditor = useCallback(() => {
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
  }, [selectedContact, handleDelete]);

  const deleteLabel = pendingDeleteContact
    ? getContactRoleLabel(
        pendingDeleteContact.role,
        pendingDeleteContact.customLabel
      )
    : '';

  return (
    <>
      <DashboardCard variant='settings' className='p-5'>
        <div className='space-y-4'>
          <div className='flex flex-wrap items-center justify-between gap-3'>
            <div>
              <h3 className='text-sm font-semibold text-primary-token'>
                Contacts
              </h3>
              <p className='text-xs text-tertiary-token'>
                Team contacts shown on your profile.
              </p>
            </div>
            <Button
              type='button'
              variant='ghost'
              size='sm'
              onClick={() => addContact()}
              className='gap-1.5'
            >
              <Plus className='h-3.5 w-3.5' />
              Add contact
            </Button>
          </div>

          {contacts.length === 0 ? (
            <div className='rounded-lg border border-dashed border-subtle px-4 py-6 text-center'>
              <UserPlus className='mx-auto h-5 w-5 text-tertiary-token' />
              <p className='mt-2 text-sm font-medium text-primary-token'>
                No contacts yet
              </p>
              <p className='mt-1 text-xs text-tertiary-token'>
                Add bookings, management, and press contacts for {artistName}.
              </p>
            </div>
          ) : (
            <ul className='space-y-2'>
              {contacts.map(contact => {
                const isActive = selectedContactId === contact.id;

                return (
                  <li
                    key={contact.id}
                    className={cn(
                      'flex items-center justify-between gap-3 rounded-lg border border-subtle px-3 py-2',
                      isActive && 'bg-surface-2'
                    )}
                  >
                    <div className='min-w-0'>
                      <p className='truncate text-sm font-medium text-primary-token'>
                        {getContactRoleLabel(contact.role, contact.customLabel)}
                      </p>
                      <p className='truncate text-xs text-tertiary-token'>
                        {getContactDetail(contact)}
                      </p>
                    </div>
                    <Button
                      type='button'
                      variant='ghost'
                      size='sm'
                      onClick={() => handleOpenEditor(contact.id)}
                      className='gap-1.5'
                    >
                      <Pencil className='h-3.5 w-3.5' />
                      Edit
                    </Button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </DashboardCard>

      <ContactDetailSidebar
        contact={selectedContact}
        isOpen={Boolean(selectedContact)}
        onClose={handleCloseEditor}
        onUpdate={handleUpdate}
        onSave={handleSaveSelected}
        onDelete={handleDeleteSelected}
        drawerClassName='fixed inset-y-0 right-0 z-50 h-screen'
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
