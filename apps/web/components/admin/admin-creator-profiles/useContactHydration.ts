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
  enabled?: boolean;
}

interface UseContactHydrationReturn {
  draftContact: Contact | null;
  setDraftContact: (contact: Contact | null) => void;
  effectiveContact: Contact | null;
  refetchSocialLinks: () => void;
  handleContactChange: (updated: Contact) => void;
  isLoading: boolean;
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
  enabled = true,
}: UseContactHydrationOptions): UseContactHydrationReturn {
  const [draftContact, setDraftContact] = useState<Contact | null>(null);

  const selectedProfile = useMemo(
    () => profiles.find(p => p.id === selectedId) ?? null,
    [profiles, selectedId]
  );

  const {
    data: socialLinks,
    isLoading,
    refetch,
  } = useAdminSocialLinksQuery({
    profileId: selectedId ?? undefined,
    enabled: enabled && !!selectedId,
  });

  // Update draft contact when social links data changes
  useEffect(() => {
    if (!selectedId || !enabled) return;

    const contactBase = mapProfileToContact(selectedProfile);
    if (!contactBase) return;

    if (socialLinks && socialLinks.length > 0) {
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
      setDraftContact(contactBase);
    }
  }, [selectedId, enabled, socialLinks, selectedProfile]);

  const refetchSocialLinks = useCallback(() => {
    void refetch();
  }, [refetch]);

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
    refetchSocialLinks,
    handleContactChange,
    isLoading,
  };
}
