'use client';

import { useCallback, useMemo, useState } from 'react';
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

/** UI state for a contact (separate from domain data) */
interface ContactUIState {
  isExpanded: boolean;
  isSaving: boolean;
  error: string | null;
  customTerritory: string;
  isNew: boolean;
}

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
 *
 * Special handling for "Worldwide":
 * - When Worldwide is selected, all other territories are removed
 * - When any other territory is selected while Worldwide is active, Worldwide is removed
 */
function toggleTerritoryForContact(
  contact: EditableContact,
  territory: string,
  profileId: string
): EditableContact {
  const exists = contact.territories.includes(territory);

  let nextTerritories: string[];

  if (territory === 'Worldwide') {
    // Toggle Worldwide: if already selected, remove it; otherwise set it as the only territory
    nextTerritories = exists ? [] : ['Worldwide'];
  } else if (exists) {
    // Removing a non-Worldwide territory
    nextTerritories = contact.territories.filter(t => t !== territory);
  } else {
    // Adding a non-Worldwide territory: remove Worldwide if present
    nextTerritories = [
      ...contact.territories.filter(t => t !== 'Worldwide'),
      territory,
    ];
  }

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
  // Domain state - the actual contact data
  const [contacts, setContacts] = useState<DashboardContact[]>(
    () => initialContacts
  );

  // UI state - keyed by contact ID
  const [uiState, setUiState] = useState<Record<string, ContactUIState>>(() =>
    initialContacts.reduce(
      (acc, contact) => ({
        ...acc,
        [contact.id]: {
          isExpanded: initialContacts.length === 1,
          isSaving: false,
          error: null,
          customTerritory: '',
          isNew: false,
        },
      }),
      {}
    )
  );

  // Baseline for cancel/revert (domain data only)
  const [baseline, setBaseline] = useState<Record<string, DashboardContact>>(
    () =>
      initialContacts.reduce(
        (acc, contact) => ({ ...acc, [contact.id]: contact }),
        {}
      )
  );

  const hasContacts = contacts.length > 0;

  // Merge domain and UI state for consumers
  const editableContacts = useMemo<EditableContact[]>(
    () =>
      contacts.map(contact => ({
        ...contact,
        ...uiState[contact.id],
      })),
    [contacts, uiState]
  );

  const updateContact = useCallback(
    (id: string, updates: Partial<EditableContact>): void => {
      // Separate domain updates from UI updates
      const {
        isExpanded,
        isSaving,
        error,
        customTerritory,
        isNew,
        ...domainUpdates
      } = updates;
      const uiUpdates = { isExpanded, isSaving, error, customTerritory, isNew };

      // Update domain state if there are domain updates
      if (Object.keys(domainUpdates).length > 0) {
        setContacts(prev =>
          prev.map(contact =>
            contact.id === id ? { ...contact, ...domainUpdates } : contact
          )
        );
      }

      // Update UI state
      const hasUiUpdates = Object.values(uiUpdates).some(v => v !== undefined);
      if (hasUiUpdates) {
        setUiState(prev => ({
          ...prev,
          [id]: {
            ...prev[id],
            ...(isExpanded !== undefined && { isExpanded }),
            ...(isSaving !== undefined && { isSaving }),
            ...(error !== undefined && { error }),
            ...(customTerritory !== undefined && { customTerritory }),
            ...(isNew !== undefined && { isNew }),
          },
        }));
      }
    },
    []
  );

  const handleToggleTerritory = useCallback(
    (contactId: string, territory: string) => {
      setContacts(prev =>
        prev.map(contact =>
          contact.id === contactId
            ? toggleTerritoryForContact(contact, territory, profileId)
            : contact
        )
      );
    },
    [profileId]
  );

  const addCustomTerritory = useCallback(
    (contactId: string) => {
      const customTerritoryValue = uiState[contactId]?.customTerritory?.trim();
      if (!customTerritoryValue) return;
      handleToggleTerritory(contactId, customTerritoryValue);
      setUiState(prev => ({
        ...prev,
        [contactId]: { ...prev[contactId], customTerritory: '' },
      }));
    },
    [uiState, handleToggleTerritory]
  );

  const handleSave = useCallback(
    async (contact: EditableContact) => {
      const contactId = contact.id;
      const isNewContact = contactId.startsWith('temp-');

      // Single UI state update for starting save
      setUiState(prev => ({
        ...prev,
        [contactId]: { ...prev[contactId], isSaving: true, error: null },
      }));

      try {
        const payload: DashboardContactInput = {
          ...contact,
          id: isNewContact ? undefined : contactId,
          profileId,
        };
        const validated = sanitizeContactInput(payload);
        const saved = await saveContact(validated);

        // Batch all success updates together
        setContacts(prev =>
          prev.map(item => (item.id === contactId ? saved : item))
        );
        setBaseline(prev => ({ ...prev, [saved.id]: saved }));
        setUiState(prev => {
          const next = { ...prev };
          // Remove old temp ID entry if it was a new contact
          if (isNewContact && saved.id !== contactId) {
            delete next[contactId];
          }
          next[saved.id] = {
            isExpanded: false,
            isSaving: false,
            error: null,
            customTerritory: '',
            isNew: false,
          };
          return next;
        });

        toast.success('Contact saved');
        track(
          isNewContact
            ? 'contacts_contact_created'
            : 'contacts_contact_updated',
          {
            handle: artistHandle,
            role: saved.role,
            territory_count: saved.territories.length,
          }
        );
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'Unable to save contact';
        setUiState(prev => ({
          ...prev,
          [contactId]: { ...prev[contactId], isSaving: false, error: message },
        }));
        toast.error(message);
      }
    },
    [profileId, artistHandle]
  );

  const handleDelete = useCallback(
    async (contact: EditableContact) => {
      const contactId = contact.id;

      // Handle temp contacts (not persisted yet)
      if (!contactId || contactId.startsWith('temp-')) {
        setContacts(prev => prev.filter(item => item.id !== contactId));
        setUiState(prev => {
          const next = { ...prev };
          delete next[contactId];
          return next;
        });
        return;
      }

      const confirmed = window.confirm(
        'Remove this contact from your profile?'
      );
      if (!confirmed) return;

      // Store backup for rollback
      const backup = contacts.find(c => c.id === contactId);
      const backupUiState = uiState[contactId];

      // Optimistic delete - remove immediately
      setContacts(prev => prev.filter(c => c.id !== contactId));
      setUiState(prev => {
        const next = { ...prev };
        delete next[contactId];
        return next;
      });

      try {
        await deleteContact(contactId, profileId);
        setBaseline(prev => {
          const next = { ...prev };
          delete next[contactId];
          return next;
        });
        toast.success('Contact removed');
        track('contacts_contact_deleted', {
          handle: artistHandle,
          role: contact.role,
        });
      } catch (error) {
        // Rollback on error
        if (backup) {
          setContacts(prev => [...prev, backup]);
          setUiState(prev => ({
            ...prev,
            [contactId]: backupUiState ?? {
              isExpanded: false,
              isSaving: false,
              error: null,
              customTerritory: '',
              isNew: false,
            },
          }));
        }
        const message =
          error instanceof Error ? error.message : 'Unable to delete contact';
        toast.error(message);
      }
    },
    [contacts, uiState, profileId, artistHandle]
  );

  const handleCancel = useCallback(
    (contact: EditableContact) => {
      const contactId = contact.id;

      if (!contactId || contactId.startsWith('temp-')) {
        setContacts(prev => prev.filter(item => item.id !== contactId));
        setUiState(prev => {
          const next = { ...prev };
          delete next[contactId];
          return next;
        });
        return;
      }

      const baselineContact = baseline[contactId];
      if (!baselineContact) return;

      // Revert domain state to baseline
      setContacts(prev =>
        prev.map(item => (item.id === contactId ? baselineContact : item))
      );
      // Reset UI state
      setUiState(prev => ({
        ...prev,
        [contactId]: {
          isExpanded: false,
          isSaving: false,
          error: null,
          customTerritory: '',
          isNew: false,
        },
      }));
    },
    [baseline]
  );

  const addContact = useCallback(
    (role: ContactRole = 'bookings') => {
      const newId = `temp-${makeTempId()}`;
      const newContact: DashboardContact = {
        id: newId,
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
      };
      setContacts(prev => [...prev, newContact]);
      setUiState(prev => ({
        ...prev,
        [newId]: {
          isExpanded: true,
          isSaving: false,
          error: null,
          customTerritory: '',
          isNew: true,
        },
      }));
    },
    [profileId, contacts.length]
  );

  return useMemo(
    () => ({
      contacts: editableContacts,
      hasContacts,
      updateContact,
      handleToggleTerritory,
      addCustomTerritory,
      handleSave,
      handleDelete,
      handleCancel,
      addContact,
    }),
    [
      editableContacts,
      hasContacts,
      updateContact,
      handleToggleTerritory,
      addCustomTerritory,
      handleSave,
      handleDelete,
      handleCancel,
      addContact,
    ]
  );
}
