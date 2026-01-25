'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  useDashboardSocialLinksQuery,
  useSaveSocialLinksMutation,
} from '@/lib/queries/useDashboardSocialLinksQuery';
import { normalizeUrl } from '@/lib/utils/platform-detection';
import type { SocialLink, UseSocialsFormReturn } from './types';

interface UseSocialsFormOptions {
  artistId: string;
}

export function useSocialsForm({
  artistId,
}: UseSocialsFormOptions): UseSocialsFormReturn {
  // Local state for editing links (initialized from query data)
  const [socialLinks, setSocialLinks] = useState<SocialLink[]>([]);
  const timers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  // TanStack Query for fetching social links
  const {
    data: fetchedLinks,
    isLoading: isFetching,
    error: fetchError,
  } = useDashboardSocialLinksQuery(artistId);

  // TanStack Query mutation for saving social links
  const {
    mutateAsync: saveMutation,
    isPending: isSaving,
    isSuccess,
    reset: resetMutation,
  } = useSaveSocialLinksMutation(artistId);

  // Sync fetched data to local state when it changes
  useEffect(() => {
    if (fetchedLinks) {
      setSocialLinks(fetchedLinks);
    }
  }, [fetchedLinks]);

  // Auto-clear success state after 3 seconds
  useEffect(() => {
    if (isSuccess) {
      const timer = setTimeout(() => {
        resetMutation();
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [isSuccess, resetMutation]);

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();

      const linksToInsert = socialLinks
        .filter(link => link.url.trim())
        .map((link, index) => ({
          platform: link.platform,
          platformType: link.platform,
          url: link.url.trim(),
          sortOrder: index,
          isActive: true,
        }));

      await saveMutation({ profileId: artistId, links: linksToInsert });
    },
    [artistId, socialLinks, saveMutation]
  );

  const removeSocialLink = useCallback((index: number) => {
    setSocialLinks(prev => prev.filter((_, i) => i !== index));
  }, []);

  const updateSocialLink = useCallback(
    (index: number, field: keyof SocialLink, value: string) => {
      setSocialLinks(prev => {
        const updatedLinks = [...prev];
        updatedLinks[index] = { ...updatedLinks[index], [field]: value };
        return updatedLinks;
      });
    },
    []
  );

  const scheduleNormalize = useCallback((index: number, raw: string) => {
    const key = `${index}-url`;
    if (timers.current[key]) {
      clearTimeout(timers.current[key]);
    }
    timers.current[key] = setTimeout(() => {
      try {
        const norm = normalizeUrl(raw.trim());
        setSocialLinks(prev => {
          const next = [...prev];
          if (!next[index]) return prev;
          if (next[index].url === norm) return prev;
          next[index] = { ...next[index], url: norm };
          return next;
        });
      } catch {
        // ignore
      }
    }, 500);
  }, []);

  const handleUrlBlur = useCallback((index: number) => {
    setSocialLinks(prev => {
      const next = [...prev];
      if (!next[index]) return prev;
      const norm = normalizeUrl((next[index].url || '').trim());
      if (next[index].url === norm) return prev;
      next[index] = { ...next[index], url: norm };
      return next;
    });
  }, []);

  const addSocialLink = useCallback(() => {
    setSocialLinks(prev => [
      ...prev,
      { id: '', platform: 'instagram', url: '' },
    ]);
  }, []);

  return {
    loading: isFetching || isSaving,
    error: fetchError ? 'Failed to load social links' : undefined,
    success: isSuccess,
    socialLinks,
    handleSubmit,
    removeSocialLink,
    updateSocialLink,
    scheduleNormalize,
    handleUrlBlur,
    addSocialLink,
  };
}
