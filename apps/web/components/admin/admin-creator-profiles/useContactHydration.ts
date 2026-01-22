'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { AdminCreatorProfileRow } from '@/lib/admin/creator-profiles';
import { type AdminSocialLink, useAdminSocialLinksQuery } from '@/lib/queries';
import type { Contact } from '@/types';
import { mapProfileToContact } from './utils';

/** Simple social link shape for comparison */
interface SimpleSocialLink {
  id?: string;
  url: string;
  label?: string;
  platformType?: string;
}

/** Check if two admin social link arrays are equal by comparing key fields */
function areAdminSocialLinksEqual(
  a: AdminSocialLink[] | undefined,
  b: AdminSocialLink[] | undefined
): boolean {
  if (!a && !b) return true;
  if (!a || !b) return false;
  if (a.length !== b.length) return false;
  return a.every(
    (link, i) =>
      link.id === b[i].id &&
      link.url === b[i].url &&
      link.label === b[i].label &&
      link.platformType === b[i].platformType
  );
}

/** Check if two simple social link arrays are equal */
function areSimpleSocialLinksEqual(
  a: SimpleSocialLink[] | undefined,
  b: SimpleSocialLink[] | undefined
): boolean {
  if (!a && !b) return true;
  if (!a || !b) return false;
  if (a.length !== b.length) return false;
  return a.every(
    (link, i) =>
      link.id === b[i].id &&
      link.url === b[i].url &&
      link.label === b[i].label &&
      link.platformType === b[i].platformType
  );
}

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

  // Track previous social links to avoid unnecessary state updates
  const prevSocialLinksRef = useRef(socialLinks);

  // Update draft contact when social links data changes
  useEffect(() => {
    if (!selectedId || !enabled) return;

    const contactBase = mapProfileToContact(selectedProfile);
    if (!contactBase) return;

    // Build new social links array
    const newSocialLinks =
      socialLinks && socialLinks.length > 0
        ? socialLinks.map(link => ({
            id: link.id,
            label: link.label,
            url: link.url,
            platformType: link.platformType,
          }))
        : undefined;

    // Skip update if social links haven't actually changed
    if (areAdminSocialLinksEqual(prevSocialLinksRef.current, socialLinks)) {
      return;
    }
    prevSocialLinksRef.current = socialLinks;

    setDraftContact(prev => {
      // Skip update if the contact ID matches and social links are the same
      if (
        prev?.id === contactBase.id &&
        areSimpleSocialLinksEqual(prev.socialLinks, newSocialLinks)
      ) {
        return prev;
      }
      return newSocialLinks
        ? { ...contactBase, socialLinks: newSocialLinks }
        : contactBase;
    });
  }, [selectedId, enabled, socialLinks, selectedProfile]);

  const refetchSocialLinks = useCallback(() => {
    refetch();
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
