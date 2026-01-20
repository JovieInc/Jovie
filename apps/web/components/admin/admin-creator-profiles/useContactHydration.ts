'use client';

import { useCallback, useMemo, useState } from 'react';
import type { AdminCreatorProfileRow } from '@/lib/admin/creator-profiles';
import type { Contact } from '@/types';
import type { AdminCreatorSocialLinksResponse } from './types';
import { mapProfileToContact } from './utils';

interface UseContactHydrationOptions {
  profiles: AdminCreatorProfileRow[];
  selectedId: string | null;
}

interface UseContactHydrationReturn {
  draftContact: Contact | null;
  setDraftContact: (contact: Contact | null) => void;
  effectiveContact: Contact | null;
  hydrateContactSocialLinks: (profileId: string) => Promise<void>;
  handleContactChange: (updated: Contact) => void;
}

/**
 * Hook to manage contact hydration and social links fetching for the admin sidebar.
 */
export function useContactHydration({
  profiles,
  selectedId,
}: UseContactHydrationOptions): UseContactHydrationReturn {
  const [draftContact, setDraftContact] = useState<Contact | null>(null);

  const selectedProfile = useMemo(
    () => profiles.find(p => p.id === selectedId) ?? null,
    [profiles, selectedId]
  );

  const hydrateContactSocialLinks = useCallback(
    async (profileId: string): Promise<void> => {
      const contactBase = mapProfileToContact(
        profiles.find(p => p.id === profileId) ?? null
      );
      if (!contactBase) return;

      try {
        const response = await fetch(
          `/api/admin/creator-social-links?profileId=${encodeURIComponent(profileId)}`,
          {
            headers: {
              Accept: 'application/json',
            },
          }
        );

        const payload = (await response
          .json()
          .catch(() => null)) as AdminCreatorSocialLinksResponse | null;

        if (!response.ok || !payload?.success) {
          setDraftContact(contactBase);
          return;
        }

        setDraftContact({
          ...contactBase,
          socialLinks: payload.links.map(link => ({
            id: link.id,
            label: link.label,
            url: link.url,
            platformType: link.platformType,
          })),
        });
      } catch {
        setDraftContact(contactBase);
      }
    },
    [profiles]
  );

  const effectiveContact = useMemo(() => {
    if (draftContact?.id === selectedId) return draftContact;
    return mapProfileToContact(selectedProfile);
  }, [draftContact, selectedId, selectedProfile]);

  const handleContactChange = useCallback((updated: Contact) => {
    setDraftContact(updated);
  }, []);

  return {
    draftContact,
    setDraftContact,
    effectiveContact,
    hydrateContactSocialLinks,
    handleContactChange,
  };
}
