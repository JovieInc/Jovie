'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { AdminCreatorProfileRow } from '@/lib/admin/creator-profiles';
import { useAdminSocialLinksQuery } from '@/lib/queries';
import type { Contact } from '@/types';
import { mapProfileToContact } from './utils';

interface UseContactHydrationOptions {
  profiles: AdminCreatorProfileRow[];
  selectedId: string | null;
  /** Whether the sidebar is open. Query is disabled when false. */
  sidebarOpen?: boolean;
}

interface UseContactHydrationReturn {
  draftContact: Contact | null;
  setDraftContact: (contact: Contact | null) => void;
  effectiveContact: Contact | null;
  /** @deprecated Use TanStack Query caching instead. Kept for compatibility. */
  hydrateContactSocialLinks: (profileId: string) => Promise<void>;
  handleContactChange: (updated: Contact) => void;
}

/**
 * Hook to manage contact hydration and social links fetching for the admin sidebar.
 *
 * Uses TanStack Query with STANDARD_CACHE (5 min staleTime) to avoid
 * refetching social links when switching between the same rows.
 */
export function useContactHydration({
  profiles,
  selectedId,
  sidebarOpen = false,
}: UseContactHydrationOptions): UseContactHydrationReturn {
  const [draftContact, setDraftContact] = useState<Contact | null>(null);

  const selectedProfile = useMemo(
    () => profiles.find(p => p.id === selectedId) ?? null,
    [profiles, selectedId]
  );

  // Use TanStack Query for social links with caching
  const { data: socialLinks, refetch } = useAdminSocialLinksQuery({
    profileId: selectedId ?? undefined,
    enabled: sidebarOpen && !!selectedId,
  });

  // Update draft contact when social links data changes
  useEffect(() => {
    if (!selectedId || !sidebarOpen) return;

    const contactBase = mapProfileToContact(
      profiles.find(p => p.id === selectedId) ?? null
    );
    if (!contactBase) return;

    // Only update if we have fresh data from the query
    if (socialLinks) {
      setDraftContact({
        ...contactBase,
        socialLinks: socialLinks.map(link => ({
          id: link.id,
          label: link.label,
          url: link.url,
          platformType: link.platformType,
        })),
      });
    } else {
      // Set base contact while loading
      setDraftContact(contactBase);
    }
  }, [selectedId, sidebarOpen, socialLinks, profiles]);

  // Legacy function kept for compatibility - triggers refetch
  const hydrateContactSocialLinks = useCallback(
    async (profileId: string): Promise<void> => {
      if (profileId !== selectedId) return;
      await refetch();
    },
    [selectedId, refetch]
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
