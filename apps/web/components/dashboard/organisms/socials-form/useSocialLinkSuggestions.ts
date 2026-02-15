'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useState } from 'react';
import type { ProfileSuggestion } from '@/app/api/suggestions/route';
import { STANDARD_CACHE } from '@/lib/queries/cache-strategies';
import { queryKeys } from '@/lib/queries/keys';

export interface SocialLinkSuggestion {
  id: string;
  platform: string;
  platformLabel: string;
  url: string;
  username: string | null;
  confidence: number | null;
}

interface UseSocialLinkSuggestionsReturn {
  suggestions: SocialLinkSuggestion[];
  isLoading: boolean;
  actioningId: string | null;
  confirm: (suggestion: SocialLinkSuggestion) => Promise<void>;
  dismiss: (suggestion: SocialLinkSuggestion) => Promise<void>;
}

function toSocialLinkSuggestion(s: ProfileSuggestion): SocialLinkSuggestion {
  return {
    id: s.id,
    platform: s.platform,
    platformLabel: s.platformLabel,
    url: s.externalUrl ?? '',
    username: s.title?.startsWith('@') ? s.title.slice(1) : s.title,
    confidence: s.confidence,
  };
}

async function fetchSocialLinkSuggestions(
  profileId: string,
  signal?: AbortSignal
): Promise<SocialLinkSuggestion[]> {
  const res = await fetch(
    `/api/suggestions?profileId=${encodeURIComponent(profileId)}`,
    { signal }
  );
  if (!res.ok) return [];
  const data = await res.json();
  if (data.success && Array.isArray(data.suggestions)) {
    return (data.suggestions as ProfileSuggestion[])
      .filter(s => s.type === 'social_link')
      .map(toSocialLinkSuggestion);
  }
  return [];
}

export function useSocialLinkSuggestions(
  profileId: string | undefined
): UseSocialLinkSuggestionsReturn {
  const queryClient = useQueryClient();
  const [actioningId, setActioningId] = useState<string | null>(null);

  const { data: suggestions = [], isLoading } = useQuery({
    queryKey: queryKeys.suggestions.list(profileId!),
    queryFn: ({ signal }) => fetchSocialLinkSuggestions(profileId!, signal),
    enabled: !!profileId,
    ...STANDARD_CACHE,
  });

  const confirm = useCallback(
    async (suggestion: SocialLinkSuggestion) => {
      if (actioningId || !profileId) return;
      setActioningId(suggestion.id);
      try {
        const res = await fetch(
          `/api/suggestions/social-links/${suggestion.id}/approve`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ profileId }),
          }
        );
        if (res.ok) {
          // Optimistically remove from cache
          queryClient.setQueryData<SocialLinkSuggestion[]>(
            queryKeys.suggestions.list(profileId),
            old => old?.filter(s => s.id !== suggestion.id) ?? []
          );
          queryClient.invalidateQueries({
            queryKey: queryKeys.dashboard.socialLinks(profileId),
          });
        }
      } finally {
        setActioningId(null);
      }
    },
    [actioningId, profileId, queryClient]
  );

  const dismiss = useCallback(
    async (suggestion: SocialLinkSuggestion) => {
      if (actioningId || !profileId) return;
      setActioningId(suggestion.id);
      try {
        const res = await fetch(
          `/api/suggestions/social-links/${suggestion.id}/reject`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ profileId }),
          }
        );
        if (res.ok) {
          // Optimistically remove from cache
          queryClient.setQueryData<SocialLinkSuggestion[]>(
            queryKeys.suggestions.list(profileId),
            old => old?.filter(s => s.id !== suggestion.id) ?? []
          );
        }
      } finally {
        setActioningId(null);
      }
    },
    [actioningId, profileId, queryClient]
  );

  return { suggestions, isLoading, actioningId, confirm, dismiss };
}
