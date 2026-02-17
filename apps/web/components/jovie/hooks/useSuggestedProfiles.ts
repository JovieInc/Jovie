'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import type {
  ProfileSuggestion,
  SuggestionsStarterContext,
} from '@/app/api/suggestions/route';

interface UseSuggestedProfilesReturn {
  suggestions: ProfileSuggestion[];
  isLoading: boolean;
  /** Currently displayed suggestion index */
  currentIndex: number;
  /** Total number of suggestions */
  total: number;
  /** Navigate to the next suggestion */
  next: () => void;
  /** Navigate to the previous suggestion */
  prev: () => void;
  /** Confirm/approve the current suggestion */
  confirm: () => Promise<void>;
  /** Reject/dismiss the current suggestion */
  reject: () => Promise<void>;
  /** Whether an action (confirm/reject) is in progress */
  isActioning: boolean;

  /** Contextual data used to personalize starter prompts */
  starterContext: SuggestionsStarterContext | null;
}

export function useSuggestedProfiles(
  profileId: string | undefined
): UseSuggestedProfilesReturn {
  const [suggestions, setSuggestions] = useState<ProfileSuggestion[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isActioning, setIsActioning] = useState(false);
  const [starterContext, setStarterContext] =
    useState<SuggestionsStarterContext | null>(null);
  const fetchedRef = useRef(false);

  // Fetch suggestions on mount
  useEffect(() => {
    if (!profileId || fetchedRef.current) return;
    fetchedRef.current = true;

    async function fetchSuggestions() {
      try {
        const res = await fetch(
          `/api/suggestions?profileId=${encodeURIComponent(profileId!)}`
        );
        if (!res.ok) return;
        const data = await res.json();
        if (data.success && Array.isArray(data.suggestions)) {
          const ctx = data.starterContext ?? null;
          const items = [...data.suggestions];

          // Prepend "Profile Ready" card for new users
          if (ctx && (ctx.isRecentlyOnboarded || ctx.conversationCount === 0)) {
            items.unshift({
              id: '__profile_ready__',
              type: 'profile_ready',
              platform: '',
              platformLabel: '',
              title: 'Your profile is live',
              subtitle: '',
              imageUrl: null,
              externalUrl: null,
              confidence: null,
            });
          }

          setSuggestions(items);
          setStarterContext(ctx);
        }
      } finally {
        setIsLoading(false);
      }
    }

    fetchSuggestions();
  }, [profileId]);

  const next = useCallback(() => {
    setCurrentIndex(i => Math.min(i + 1, suggestions.length - 1));
  }, [suggestions.length]);

  const prev = useCallback(() => {
    setCurrentIndex(i => Math.max(i - 1, 0));
  }, []);

  const removeCurrent = useCallback(() => {
    setSuggestions(prev => {
      const next = prev.filter((_, i) => i !== currentIndex);
      return next;
    });
    // Adjust index if we removed the last item
    setCurrentIndex(i => Math.min(i, Math.max(suggestions.length - 2, 0)));
  }, [currentIndex, suggestions.length]);

  const confirm = useCallback(async () => {
    const suggestion = suggestions[currentIndex];
    if (!suggestion || !profileId || isActioning) return;

    // Profile ready card — dismiss locally, no API call
    if (suggestion.type === 'profile_ready') {
      removeCurrent();
      return;
    }

    setIsActioning(true);
    try {
      let url: string;
      let body: Record<string, string>;

      switch (suggestion.type) {
        case 'dsp_match':
          url = `/api/dsp/matches/${suggestion.id}/confirm`;
          body = { profileId };
          break;
        case 'social_link':
          url = `/api/suggestions/social-links/${suggestion.id}/approve`;
          body = { profileId };
          break;
        case 'avatar':
          url = `/api/suggestions/avatars/${suggestion.id}/select`;
          body = { profileId };
          break;
      }

      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (res.ok) {
        removeCurrent();
      }
    } finally {
      setIsActioning(false);
    }
  }, [suggestions, currentIndex, profileId, isActioning, removeCurrent]);

  const reject = useCallback(async () => {
    const suggestion = suggestions[currentIndex];
    if (!suggestion || !profileId || isActioning) return;

    // Profile ready card — dismiss locally, no API call
    if (suggestion.type === 'profile_ready') {
      removeCurrent();
      return;
    }

    setIsActioning(true);
    try {
      let url: string;
      let body: Record<string, string>;

      switch (suggestion.type) {
        case 'dsp_match':
          url = `/api/dsp/matches/${suggestion.id}/reject`;
          body = { profileId };
          break;
        case 'social_link':
          url = `/api/suggestions/social-links/${suggestion.id}/reject`;
          body = { profileId };
          break;
        case 'avatar':
          url = `/api/suggestions/avatars/${suggestion.id}/dismiss`;
          body = { profileId };
          break;
      }

      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (res.ok) {
        removeCurrent();
      }
    } finally {
      setIsActioning(false);
    }
  }, [suggestions, currentIndex, profileId, isActioning, removeCurrent]);

  return {
    suggestions,
    isLoading,
    currentIndex,
    total: suggestions.length,
    next,
    prev,
    confirm,
    reject,
    isActioning,
    starterContext,
  };
}
