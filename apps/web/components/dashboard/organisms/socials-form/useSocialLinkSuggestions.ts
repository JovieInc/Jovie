'use client';

import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { ProfileSuggestion } from '@/app/api/suggestions/route';
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

export function useSocialLinkSuggestions(
  profileId: string | undefined
): UseSocialLinkSuggestionsReturn {
  const [suggestions, setSuggestions] = useState<SocialLinkSuggestion[]>([]);
  const [isLoading, setIsLoading] = useState(!!profileId);
  const [actioningId, setActioningId] = useState<string | null>(null);
  const fetchedProfileIdRef = useRef<string | null>(null);
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!profileId) {
      setIsLoading(false);
      return;
    }
    if (fetchedProfileIdRef.current === profileId) return;
    fetchedProfileIdRef.current = profileId;
    setIsLoading(true);
    setSuggestions([]);

    (async () => {
      try {
        const res = await fetch(
          `/api/suggestions?profileId=${encodeURIComponent(profileId)}`
        );
        if (!res.ok) return;
        const data = await res.json();
        if (data.success && Array.isArray(data.suggestions)) {
          setSuggestions(
            (data.suggestions as ProfileSuggestion[])
              .filter(s => s.type === 'social_link')
              .map(toSocialLinkSuggestion)
          );
        }
      } finally {
        setIsLoading(false);
      }
    })();
  }, [profileId]);

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
          setSuggestions(prev => prev.filter(s => s.id !== suggestion.id));
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
          setSuggestions(prev => prev.filter(s => s.id !== suggestion.id));
        }
      } finally {
        setActioningId(null);
      }
    },
    [actioningId, profileId]
  );

  return { suggestions, isLoading, actioningId, confirm, dismiss };
}
