'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import type {
  ProfileReadiness,
  ProfileSuggestion,
  SuggestionsStarterContext,
} from '@/app/api/suggestions/route';
import { APP_ROUTES } from '@/constants/routes';

export interface UseSuggestedProfilesReturn {
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

interface UseSuggestedProfilesOptions {
  enabled?: boolean;
}

/**
 * Nudge card ids for missing profile essentials (JOV-8137). Exported so the
 * carousel can pick an icon without duplicating the id strings.
 */
export const PROFILE_NUDGE_IDS = {
  photo: '__nudge_photo__',
  name: '__nudge_name__',
  handle: '__nudge_handle__',
  music: '__nudge_music__',
} as const;

function nudgeCard(id: string, title: string, href: string): ProfileSuggestion {
  return {
    id,
    type: 'profile_nudge',
    platform: '',
    platformLabel: '',
    title,
    subtitle: 'Complete this essential so fans can find you.',
    imageUrl: null,
    externalUrl: href,
    confidence: null,
  };
}

/**
 * One nudge card per missing profile essential, in score order (JOV-8137):
 * photo, name, handle, then music. Shown in place of the "profile is live"
 * card until all four essentials are set.
 */
export function buildProfileNudges(
  readiness: ProfileReadiness
): ProfileSuggestion[] {
  const nudges: ProfileSuggestion[] = [];

  if (!readiness.hasPhoto) {
    nudges.push(
      nudgeCard(
        PROFILE_NUDGE_IDS.photo,
        'Set a profile photo',
        APP_ROUTES.SETTINGS_PROFILE
      )
    );
  }
  if (!readiness.hasName) {
    nudges.push(
      nudgeCard(
        PROFILE_NUDGE_IDS.name,
        'Set your artist name',
        APP_ROUTES.SETTINGS_PROFILE
      )
    );
  }
  if (!readiness.hasHandle) {
    nudges.push(
      nudgeCard(
        PROFILE_NUDGE_IDS.handle,
        'Claim your handle',
        APP_ROUTES.SETTINGS_PROFILE
      )
    );
  }
  if (!readiness.hasMusicDsp) {
    nudges.push(
      nudgeCard(
        PROFILE_NUDGE_IDS.music,
        'Add your music (connect Spotify)',
        APP_ROUTES.CHAT_PROFILE_PANEL
      )
    );
  }

  return nudges;
}

export function useSuggestedProfiles(
  profileId: string | undefined,
  options: UseSuggestedProfilesOptions = {}
): UseSuggestedProfilesReturn {
  const { enabled = true } = options;
  const [suggestions, setSuggestions] = useState<ProfileSuggestion[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isActioning, setIsActioning] = useState(false);
  const [starterContext, setStarterContext] =
    useState<SuggestionsStarterContext | null>(null);
  const fetchedRef = useRef(false);

  // Fetch suggestions on mount
  useEffect(() => {
    if (!enabled) {
      setIsLoading(false);
      return;
    }

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

          // JOV-8137: "Your profile is live" requires photo, name, handle,
          // and at least one music DSP — server-computed readiness is the
          // source of truth. Incomplete profiles get nudge cards instead.
          // Missing readiness data never claims liveness.
          if (ctx && (ctx.isRecentlyOnboarded || ctx.conversationCount === 0)) {
            const readiness = ctx.profileReadiness;
            if (readiness?.isComplete) {
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
            } else if (readiness) {
              items.unshift(...buildProfileNudges(readiness));
            }
          }

          setSuggestions(items);
          setStarterContext(ctx);
        }
      } finally {
        setIsLoading(false);
      }
    }

    fetchSuggestions();
  }, [enabled, profileId]);

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

    // Profile ready + nudge cards — dismiss locally, no API call
    if (
      suggestion.type === 'profile_ready' ||
      suggestion.type === 'profile_nudge'
    ) {
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
        case 'playlist_fallback':
          url = `/api/suggestions/playlist-fallback/${suggestion.id}/approve`;
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

    // Profile ready + nudge cards — dismiss locally, no API call
    if (
      suggestion.type === 'profile_ready' ||
      suggestion.type === 'profile_nudge'
    ) {
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
        case 'playlist_fallback':
          url = `/api/suggestions/playlist-fallback/${suggestion.id}/reject`;
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
