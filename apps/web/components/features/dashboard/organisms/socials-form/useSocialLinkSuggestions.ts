'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import type { ProfileSuggestion } from '@/app/api/suggestions/route';
import {
  createMutationFn,
  fetchWithTimeout,
  queryKeys,
  STANDARD_CACHE,
} from '@/lib/queries';

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

interface SuggestionsApiResponse {
  success: boolean;
  suggestions: ProfileSuggestion[];
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
  try {
    const data = await fetchWithTimeout<SuggestionsApiResponse>(
      `/api/suggestions?profileId=${encodeURIComponent(profileId)}`,
      { signal }
    );
    if (data.success && Array.isArray(data.suggestions)) {
      return data.suggestions
        .filter(s => s.type === 'social_link')
        .map(toSocialLinkSuggestion);
    }
    return [];
  } catch {
    return [];
  }
}

interface SuggestionActionInput {
  profileId: string;
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

  const approveMutation = useMutation({
    mutationFn: ({
      suggestionId,
      profileId: pid,
    }: SuggestionActionInput & { suggestionId: string }) =>
      createMutationFn<{ profileId: string }, Record<string, unknown>>(
        `/api/suggestions/social-links/${suggestionId}/approve`,
        'POST'
      )({ profileId: pid }),
    onSuccess: (_, variables) => {
      queryClient.setQueryData<SocialLinkSuggestion[]>(
        queryKeys.suggestions.list(variables.profileId),
        old => old?.filter(s => s.id !== variables.suggestionId) ?? []
      );
      queryClient.invalidateQueries({
        queryKey: queryKeys.dashboard.socialLinks(variables.profileId),
      });
    },
    onSettled: () => setActioningId(null),
  });

  const rejectMutation = useMutation({
    mutationFn: ({
      suggestionId,
      profileId: pid,
    }: SuggestionActionInput & { suggestionId: string }) =>
      createMutationFn<{ profileId: string }, Record<string, unknown>>(
        `/api/suggestions/social-links/${suggestionId}/reject`,
        'POST'
      )({ profileId: pid }),
    onSuccess: (_, variables) => {
      queryClient.setQueryData<SocialLinkSuggestion[]>(
        queryKeys.suggestions.list(variables.profileId),
        old => old?.filter(s => s.id !== variables.suggestionId) ?? []
      );
    },
    onSettled: () => setActioningId(null),
  });

  const confirm = async (suggestion: SocialLinkSuggestion) => {
    if (actioningId || !profileId) return;
    setActioningId(suggestion.id);
    await approveMutation.mutateAsync({
      suggestionId: suggestion.id,
      profileId,
    });
  };

  const dismiss = async (suggestion: SocialLinkSuggestion) => {
    if (actioningId || !profileId) return;
    setActioningId(suggestion.id);
    await rejectMutation.mutateAsync({
      suggestionId: suggestion.id,
      profileId,
    });
  };

  return { suggestions, isLoading, actioningId, confirm, dismiss };
}
