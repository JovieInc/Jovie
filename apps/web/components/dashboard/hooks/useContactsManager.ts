'use client';

import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import {
  deleteContact,
  saveContact,
} from '@/app/app/dashboard/contacts/actions';
import { track } from '@/lib/analytics';
import { sanitizeContactInput } from '@/lib/contacts/validation';
import type {
  ContactRole,
  DashboardContact,
  DashboardContactInput,
} from '@/types/contacts';

export interface EditableContact extends DashboardContact {
  isExpanded?: boolean;
  isSaving?: boolean;
  error?: string | null;
  customTerritory?: string;
  isNew?: boolean;
}

function makeTempId(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `temp-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

/**
 * Toggle a territory for a contact with input sanitization.
 * Extracted to reduce nesting depth in handleToggleTerritory.
 */
function toggleTerritoryForContact(
  contact: EditableContact,
  territory: string,
  profileId: string
): EditableContact {
  const exists = contact.territories.includes(territory);
  const nextTerritories = exists
    ? contact.territories.filter(t => t !== territory)
    : [...contact.territories, territory];

  try {
    const sanitized = sanitizeContactInput({
      ...contact,
      profileId,
      territories: nextTerritories,
    } as DashboardContactInput);
    return { ...contact, territories: sanitized.territories };
  } catch {
    return { ...contact, territories: nextTerritories };
  }
}

export interface UseContactsManagerProps {
  profileId: string;
  artistHandle: string;
  initialContacts: DashboardContact[];
}

export interface UseContactsManagerReturn {
  contacts: EditableContact[];
  hasContacts: boolean;
  updateContact: (id: string, updates: Partial<EditableContact>) => void;
  handleToggleTerritory: (contactId: string, territory: string) => void;
  addCustomTerritory: (contactId: string) => void;
  handleSave: (contact: EditableContact) => Promise<void>;
  handleDelete: (contact: EditableContact) => Promise<void>;
  handleCancel: (contact: EditableContact) => void;
  addContact: (role?: ContactRole) => void;
}

export function useContactsManager({
  profileId,
  artistHandle,
  initialContacts,
}: UseContactsManagerProps): UseContactsManagerReturn {
  const [contacts, setContacts] = useState<EditableContact[]>(() =>
    initialContacts.map(contact => ({
      ...contact,
      isExpanded: initialContacts.length === 1,
      customTerritory: '',
      error: null,
    }))
  );
  const [baseline, setBaseline] = useState<Record<string, DashboardContact>>(
    () =>
      initialContacts.reduce(
        (acc, contact) => ({ ...acc, [contact.id]: contact }),
        {}
      )
  );

  const hasContacts = contacts.length > 0;

  const updateContact = (
    id: string,
    updates: Partial<EditableContact>
  ): void => {
    setContacts(prev =>
      prev.map(contact =>
        contact.id === id ? { ...contact, ...updates, error: null } : contact
      )
    );
  };

  const handleToggleTerritory = (contactId: string, territory: string) => {
    setContacts(prev =>
      prev.map(contact =>
        contact.id === contactId
          ? toggleTerritoryForContact(contact, territory, profileId)
          : contact
      )
    );
  };

  const addCustomTerritory = (contactId: string) => {
    const target = contacts.find(contact => contact.id === contactId);
    if (!target) return;
    const value = target.customTerritory?.trim();
    if (!value) return;
    handleToggleTerritory(contactId, value);
    updateContact(contactId, { customTerritory: '' });
  };

  const handleSave = async (contact: EditableContact) => {
    updateContact(contact.id, { isSaving: true, error: null });
    try {
      const payload: DashboardContactInput = {
        ...contact,
        id: contact.id.startsWith('temp-') ? undefined : contact.id,
        profileId,
      };
      const validated = sanitizeContactInput(payload);
      const saved = await saveContact(validated);

      setContacts(prev =>
        prev.map(item =>
          item.id === contact.id
            ? {
                ...saved,
                isExpanded: false,
                customTerritory: '',
                error: null,
                isNew: false,
              }
            : item
        )
      );
      setBaseline(prev => ({ ...prev, [saved.id]: saved }));
      toast.success('Contact saved');
      track(
        contact.id && !contact.id.startsWith('temp-')
          ? 'contacts_contact_updated'
          : 'contacts_contact_created',
        {
          handle: artistHandle,
          role: saved.role,
          territory_count: saved.territories.length,
        }
      );
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Unable to save contact';
      updateContact(contact.id, { error: message });
      toast.error(message);
    } finally {
      updateContact(contact.id, { isSaving: false });
    }
  };

  const handleDelete = async (contact: EditableContact) => {
    if (!contact.id || contact.id.startsWith('temp-')) {
      setContacts(prev => prev.filter(item => item.id !== contact.id));
      return;
    }

    const confirmed = window.confirm('Remove this contact from your profile?');
    if (!confirmed) return;

    updateContact(contact.id, { isSaving: true });
    try {
      await deleteContact(contact.id, profileId);
      setContacts(prev => prev.filter(item => item.id !== contact.id));
      setBaseline(prev => {
        const next = { ...prev };
        delete next[contact.id];
        return next;
      });
      toast.success('Contact removed');
      track('contacts_contact_deleted', {
        handle: artistHandle,
        role: contact.role,
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Unable to delete contact';
      toast.error(message);
      updateContact(contact.id, { isSaving: false, error: message });
    }
  };

  const handleCancel = (contact: EditableContact) => {
    if (!contact.id || contact.id.startsWith('temp-')) {
      setContacts(prev => prev.filter(item => item.id !== contact.id));
      return;
    }
    const baselineContact = baseline[contact.id];
    if (!baselineContact) return;
    setContacts(prev =>
      prev.map(item =>
        item.id === contact.id
          ? {
              ...baselineContact,
              isExpanded: false,
              customTerritory: '',
            }
          : item
      )
    );
  };

  const addContact = (role: ContactRole = 'bookings') => {
    const newContact: EditableContact = {
      id: `temp-${makeTempId()}`,
      creatorProfileId: profileId,
      role,
      customLabel: role === 'other' ? '' : null,
      personName: '',
      companyName: '',
      territories: [],
      email: '',
      phone: '',
      preferredChannel: null,
      isActive: true,
      sortOrder: contacts.length,
      isExpanded: true,
      isNew: true,
      customTerritory: '',
      error: null,
    };
    setContacts(prev => [...prev, newContact]);
  };

  return useMemo(
    () => ({
      contacts,
      hasContacts,
      updateContact,
      handleToggleTerritory,
      addCustomTerritory,
      handleSave,
      handleDelete,
      handleCancel,
      addContact,
    }),
    [contacts, hasContacts]
  );
}
