'use client';

import React, { useState } from 'react';
import type { Contact } from '@/types';

interface UseDebouncedContactSaveOptions {
  effectiveContact: Contact | null | undefined;
  sidebarOpen: boolean;
  isSaving: boolean;
  saveContact: (contact: Contact) => Promise<boolean>;
}

/**
 * Builds a stable JSON signature for the fields that trigger a save.
 * Defined at module scope to avoid recreating it on every render.
 */
function buildContactSignature(contact: Contact): string {
  return JSON.stringify({
    id: contact.id,
    displayName: contact.displayName ?? null,
    firstName: contact.firstName ?? null,
    lastName: contact.lastName ?? null,
    username: contact.username,
    avatarUrl: contact.avatarUrl ?? null,
    socialLinks: contact.socialLinks.map((link, index) => ({
      id: link.id ?? null,
      url: link.url,
      label: link.label ?? null,
      platformType: link.platformType ?? null,
      sortOrder: index,
    })),
  });
}

/**
 * Debounced auto-save for the contact sidebar.
 *
 * Watches `effectiveContact` and fires `saveContact` 500 ms after the last
 * change, skipping saves when the sidebar is closed, a save is already in
 * flight, or the contact has not changed since the last successful save.
 */
export function useDebouncedContactSave({
  effectiveContact,
  sidebarOpen,
  isSaving,
  saveContact,
}: UseDebouncedContactSaveOptions): void {
  const [lastSavedSignature, setLastSavedSignature] = useState<string | null>(
    null
  );

  React.useEffect(() => {
    if (!sidebarOpen || !effectiveContact?.id) return;

    const signature = buildContactSignature(effectiveContact);

    if (signature === lastSavedSignature || isSaving) return;

    const timer = setTimeout(() => {
      void saveContact(effectiveContact).then(success => {
        if (success) {
          setLastSavedSignature(signature);
        }
      });
    }, 500);

    return () => {
      clearTimeout(timer);
    };
  }, [
    effectiveContact,
    isSaving,
    lastSavedSignature,
    saveContact,
    sidebarOpen,
  ]);
}
