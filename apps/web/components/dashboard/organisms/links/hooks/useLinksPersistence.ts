'use client';

/**
 * useLinksPersistence Hook
 *
 * Custom hook for persisting links to the server with optimistic locking,
 * debounced saves, and conflict resolution.
 */

import { useAsyncDebouncer } from '@tanstack/react-pacer';
import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import type { ProfileSocialLink } from '@/app/app/(shell)/dashboard/actions/social-links';
import { track } from '@/lib/analytics';
import { captureError } from '@/lib/error-tracking';
import { queryKeys } from '@/lib/queries/keys';
import type { LinkItem, PlatformType, SuggestedLink } from '../types';
import {
  areLinkItemsEqual,
  convertDbLinksToLinkItems,
  convertDbLinksToSuggestions,
} from '../utils/link-transformers';
import { isIngestableUrl } from '../utils/platform-category';

/**
 * Parse error message from a failed response
 */
async function parseErrorMessage(response: Response): Promise<string> {
  const data = (await response.json().catch(() => null)) as {
    error?: string;
  } | null;
  if (data?.error && typeof data.error === 'string') {
    return data.error;
  }
  return 'Failed to save links';
}

/**
 * Parse version from a response body
 */
function parseVersionFromBody(
  body: { version?: number; currentVersion?: number } | null
): number | null {
  const version = body?.version ?? body?.currentVersion;
  return typeof version === 'number' ? version : null;
}

/**
 * Options for the useLinksPersistence hook
 */
export interface UseLinksPersistenceOptions {
  /** Profile ID to save links for */
  profileId: string | undefined;
  /** Initial links from server */
  initialLinks: ProfileSocialLink[];
  /** Whether suggestions feature is enabled */
  suggestionsEnabled: boolean;
  /** Debounce delay in ms (default: 500) */
  debounceMs?: number;
  /** Callback when suggestions should be synced from server */
  onSyncSuggestions?: () => Promise<void>;
}

/**
 * Return type for the useLinksPersistence hook
 */
export interface UseLinksPersistenceReturn {
  /** Current links array */
  links: LinkItem[];
  /** Set links directly */
  setLinks: React.Dispatch<React.SetStateAction<LinkItem[]>>;
  /** Current version for optimistic locking */
  linksVersion: number;
  /** Set version number */
  setLinksVersion: React.Dispatch<React.SetStateAction<number>>;
  /** Suggested links array */
  suggestedLinks: SuggestedLink[];
  /** Set suggested links */
  setSuggestedLinks: React.Dispatch<React.SetStateAction<SuggestedLink[]>>;
  /** Whether auto-refresh is active */
  autoRefreshUntilMs: number | null;
  /** Set auto-refresh deadline */
  setAutoRefreshUntilMs: React.Dispatch<React.SetStateAction<number | null>>;
  /** Debounced save function */
  debouncedSave: {
    (input: LinkItem[]): void;
    flush: () => void;
    cancel: () => void;
  };
  /** Immediately persist links */
  enqueueSave: (input: LinkItem[]) => void;
  /** Ref to current links (for async access) */
  linksRef: React.RefObject<LinkItem[]>;
}

/**
 * Custom hook for managing link persistence
 *
 * Features:
 * - Optimistic locking with version tracking
 * - Debounced saves to reduce API calls
 * - Conflict resolution on 409 responses
 * - Automatic suggestion sync after ingestable URLs
 *
 * @example
 * ```tsx
 * const {
 *   links,
 *   setLinks,
 *   debouncedSave,
 *   enqueueSave,
 * } = useLinksPersistence({
 *   profileId,
 *   initialLinks,
 *   suggestionsEnabled: true,
 * });
 * ```
 */
export function useLinksPersistence({
  profileId,
  initialLinks,
  suggestionsEnabled,
  debounceMs = 500,
  onSyncSuggestions,
}: UseLinksPersistenceOptions): UseLinksPersistenceReturn {
  const queryClient = useQueryClient();

  // Split initial links into active and suggested
  const activeInitialLinks = useMemo(
    () => (initialLinks || []).filter(l => l.state !== 'suggested'),
    [initialLinks]
  );
  const suggestionInitialLinks = useMemo(
    () => (initialLinks || []).filter(l => l.state === 'suggested'),
    [initialLinks]
  );

  // Initialize links state
  const [links, setLinks] = useState<LinkItem[]>(() =>
    convertDbLinksToLinkItems(activeInitialLinks || [])
  );

  // Track version for optimistic locking
  const [linksVersion, setLinksVersion] = useState<number>(() => {
    const versions = (activeInitialLinks || [])
      .map(l => l.version ?? 1)
      .filter(v => typeof v === 'number');
    return versions.length > 0 ? Math.max(...versions) : 0;
  });

  // Ref for async access to links
  const linksRef = useRef<LinkItem[]>(links);
  useEffect(() => {
    linksRef.current = links;
  }, [links]);

  // Suggested links state
  const [suggestedLinks, setSuggestedLinks] = useState<SuggestedLink[]>(() =>
    convertDbLinksToSuggestions(suggestionInitialLinks || [])
  );

  // Auto-refresh timer for ingestable URLs
  const [autoRefreshUntilMs, setAutoRefreshUntilMs] = useState<number | null>(
    null
  );

  // Sync links when server props change
  useEffect(() => {
    setLinks(convertDbLinksToLinkItems(activeInitialLinks || []));
  }, [activeInitialLinks]);

  useEffect(() => {
    setSuggestedLinks(
      convertDbLinksToSuggestions(suggestionInitialLinks || [])
    );
  }, [suggestionInitialLinks]);

  // Save queue to ensure we never write older state after newer state
  const saveLoopRunningRef = useRef(false);
  const pendingSaveRef = useRef<LinkItem[] | null>(null);

  // Persist links to server
  const persistLinks = useCallback(
    async (input: LinkItem[]): Promise<void> => {
      // Normalize the input
      const normalized: LinkItem[] = input.map((item, index) => {
        const rawCategory = item.platform.category as PlatformType | undefined;
        const category: PlatformType =
          rawCategory === 'dsp' ||
          rawCategory === 'social' ||
          rawCategory === 'earnings' ||
          rawCategory === 'websites' ||
          rawCategory === 'custom'
            ? rawCategory
            : 'custom';

        return {
          ...item,
          platform: {
            ...item.platform,
            category,
          },
          category,
          order: typeof item.order === 'number' ? item.order : index,
        };
      });

      try {
        const payload = normalized.map((l, index) => ({
          platform: l.platform.id,
          platformType: l.platform.icon,
          url: l.normalizedUrl,
          sortOrder: index,
          isActive: l.isVisible !== false,
          displayText: l.title,
          state: l.state ?? (l.isVisible ? 'active' : 'suggested'),
          confidence:
            typeof l.confidence === 'number'
              ? Number(l.confidence.toFixed(2))
              : undefined,
          sourcePlatform: l.sourcePlatform ?? undefined,
          sourceType: l.sourceType ?? undefined,
          evidence: l.evidence ?? undefined,
        }));

        if (!profileId) {
          toast.error('Unable to save links. Please refresh and try again.');
          return;
        }

        const response = await fetch('/api/dashboard/social-links', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            profileId,
            links: payload,
            expectedVersion: linksVersion,
          }),
        });

        // Handle 409 Conflict - links were modified elsewhere
        if (response.status === 409) {
          const conflictData = (await response.json().catch(() => null)) as {
            currentVersion?: number;
          } | null;
          const conflictVersion = parseVersionFromBody(conflictData);
          if (conflictVersion !== null) {
            setLinksVersion(conflictVersion);
          }
          toast.error(
            'Your links were updated in another tab. Refreshing to show the latest version.',
            { duration: 5000 }
          );
          await onSyncSuggestions?.();
          return;
        }

        if (!response.ok) {
          const message = await parseErrorMessage(response);
          throw new Error(message);
        }

        // Parse success response and update version
        const successData = (await response.json().catch(() => null)) as {
          version?: number;
        } | null;
        const newVersion = parseVersionFromBody(successData);
        if (newVersion !== null) {
          setLinksVersion(newVersion);
        }

        // Keep normalized links locally; server IDs will be applied on next load
        setLinks(prev =>
          areLinkItemsEqual(prev, normalized) ? prev : normalized
        );

        // Check for ingestable URLs and trigger suggestion sync
        const hasIngestableLink =
          suggestionsEnabled &&
          normalized.some(item => isIngestableUrl(item.normalizedUrl));
        if (hasIngestableLink) {
          setAutoRefreshUntilMs(Date.now() + 20000);
          onSyncSuggestions?.();
        }

        // Invalidate TanStack Query cache for consistency
        if (profileId) {
          queryClient.invalidateQueries({
            queryKey: queryKeys.dashboard.socialLinks(profileId),
          });
          queryClient.invalidateQueries({
            queryKey: queryKeys.suggestions.list(profileId),
          });
        }

        // Track analytics
        track('dashboard_social_links_saved', { profileId });

        const now = new Date();
        toast.success(
          `Links saved successfully. Last saved: ${now.toLocaleTimeString()}`
        );
      } catch (error) {
        void captureError('Failed to save social links', error, {
          profileId,
          linkCount: normalized.length,
          route: '/app/dashboard/links',
        });
        const message =
          error instanceof Error && error.message
            ? error.message
            : 'Failed to save links. Please try again.';
        toast.error(message);
      }
    },
    [
      profileId,
      suggestionsEnabled,
      onSyncSuggestions,
      linksVersion,
      queryClient,
    ]
  );

  // Enqueue a save, ensuring we never write older state after newer state
  const enqueueSave = useCallback(
    (input: LinkItem[]): void => {
      pendingSaveRef.current = input;

      if (saveLoopRunningRef.current) return;
      saveLoopRunningRef.current = true;

      void (async () => {
        while (pendingSaveRef.current) {
          const next = pendingSaveRef.current;
          pendingSaveRef.current = null;
          await persistLinks(next);
        }
        saveLoopRunningRef.current = false;
      })();
    },
    [persistLinks]
  );

  // Ref to track the last input for flush functionality
  const lastInputRef = useRef<LinkItem[] | null>(null);

  // TanStack Pacer async debouncer for save operations
  const asyncDebouncer = useAsyncDebouncer(
    async (input: LinkItem[]) => {
      lastInputRef.current = null;
      enqueueSave(input);
    },
    { wait: debounceMs }
  );

  // Debounced save function with cancel and flush methods
  const debouncedSave = useMemo(() => {
    const fn = (input: LinkItem[]) => {
      lastInputRef.current = input;
      asyncDebouncer.maybeExecute(input);
    };

    fn.cancel = () => {
      asyncDebouncer.cancel();
      lastInputRef.current = null;
    };

    fn.flush = () => {
      const pending = lastInputRef.current;
      if (pending) {
        asyncDebouncer.cancel();
        lastInputRef.current = null;
        enqueueSave(pending);
      }
    };

    return fn;
  }, [asyncDebouncer, enqueueSave]);

  // Cancel pending saves when profileId changes
  useEffect(() => {
    return () => {
      asyncDebouncer.cancel();
    };
  }, [asyncDebouncer]);

  // Flush pending saves on unmount
  useEffect(() => {
    return () => {
      debouncedSave.flush();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return {
    links,
    setLinks,
    linksVersion,
    setLinksVersion,
    suggestedLinks,
    setSuggestedLinks,
    autoRefreshUntilMs,
    setAutoRefreshUntilMs,
    debouncedSave,
    enqueueSave,
    linksRef,
  };
}
