'use client';

import { useCallback, useMemo, useState } from 'react';
import { toast } from 'sonner';
import {
  deleteContact,
  saveContact,
} from '@/app/app/(shell)/dashboard/contacts/actions';
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
  isDeleting: boolean;
  error: string | null;
  customTerritory: string;
  isNew: boolean;
}

export interface EditableContact extends DashboardContact {
  isExpanded?: boolean;
  isSaving?: boolean;
  isDeleting?: boolean;
  error?: string | null;
  customTerritory?: string;
  isNew?: boolean;
}

const DEFAULT_UI_STATE: ContactUIState = {
  isExpanded: false,
  isSaving: false,
  isDeleting: false,
  error: null,
  customTerritory: '',
  isNew: false,
};

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
  readonly profileId: string;
  readonly artistHandle: string;
  readonly initialContacts: DashboardContact[];
}

export interface UseContactsManagerReturn {
  contacts: EditableContact[];
  hasContacts: boolean;
  updateContact: (id: string, updates: Partial<EditableContact>) => void;
  handleToggleTerritory: (contactId: string, territory: string) => void;
  addCustomTerritory: (contactId: string) => void;
  handleSave: (contact: EditableContact) => Promise<string | undefined>;
  handleDelete: (contact: EditableContact) => void;
  confirmDelete: () => Promise<void>;
  cancelDelete: () => void;
  pendingDeleteContact: EditableContact | null;
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
          ...DEFAULT_UI_STATE,
          isExpanded: initialContacts.length === 1,
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
        isDeleting,
        error,
        customTerritory,
        isNew,
        ...domainUpdates
      } = updates;
      const uiUpdates = {
        isExpanded,
        isSaving,
        isDeleting,
        error,
        customTerritory,
        isNew,
      };

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
            ...(isDeleting !== undefined && { isDeleting }),
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
    async (contact: EditableContact): Promise<string | undefined> => {
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
          next[saved.id] = { ...DEFAULT_UI_STATE };
          return next;
        });

        toast.success('Contact saved', { id: 'contact-save' });
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

        // Return persisted ID so callers can update selection
        return saved.id;
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'Unable to save contact';
        setUiState(prev => ({
          ...prev,
          [contactId]: { ...prev[contactId], isSaving: false, error: message },
        }));
        toast.error(message);
        return undefined;
      }
    },
    [profileId, artistHandle]
  );

  // Delete confirmation state
  const [pendingDeleteContact, setPendingDeleteContact] =
    useState<EditableContact | null>(null);

  const handleDelete = useCallback((contact: EditableContact) => {
    const contactId = contact.id;

    // Handle temp contacts (not persisted yet) - no confirmation needed
    if (!contactId || contactId.startsWith('temp-')) {
      setContacts(prev => prev.filter(item => item.id !== contactId));
      setUiState(prev => {
        const next = { ...prev };
        delete next[contactId];
        return next;
      });
      return;
    }

    // Stage contact for deletion — ConfirmDialog will call confirmDelete
    setPendingDeleteContact(contact);
  }, []);

  const cancelDelete = useCallback(() => {
    setPendingDeleteContact(null);
  }, []);

  const confirmDelete = useCallback(async () => {
    if (!pendingDeleteContact) return;
    const contact = pendingDeleteContact;
    const contactId = contact.id;
    setPendingDeleteContact(null);

    // Show deleting state
    setUiState(prev => ({
      ...prev,
      [contactId]: { ...prev[contactId], isDeleting: true, error: null },
    }));

    try {
      await deleteContact(contactId, profileId);
      // Remove after successful deletion
      setContacts(prev => prev.filter(c => c.id !== contactId));
      setUiState(prev => {
        const next = { ...prev };
        delete next[contactId];
        return next;
      });
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
      setUiState(prev => ({
        ...prev,
        [contactId]: { ...prev[contactId], isDeleting: false },
      }));
      const message =
        error instanceof Error ? error.message : 'Unable to delete contact';
      toast.error(message);
    }
  }, [pendingDeleteContact, profileId, artistHandle]);

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
        [contactId]: { ...DEFAULT_UI_STATE },
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
          ...DEFAULT_UI_STATE,
          isExpanded: true,
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
      confirmDelete,
      cancelDelete,
      pendingDeleteContact,
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
      confirmDelete,
      cancelDelete,
      pendingDeleteContact,
      handleCancel,
      addContact,
    ]
  );
}
