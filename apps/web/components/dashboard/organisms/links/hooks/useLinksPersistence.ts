/**
 * useLinksPersistence Hook
 *
 * Custom hook for persisting links to the server with optimistic locking,
 * debounced saves, and conflict resolution.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import type { ProfileSocialLink } from '@/app/app/dashboard/actions/social-links';
import { debounce } from '@/lib/utils';
import type { LinkItem, PlatformType, SuggestedLink } from '../types';
import {
  areLinkItemsEqual,
  convertDbLinksToLinkItems,
  convertDbLinksToSuggestions,
} from '../utils/link-transformers';
import { isIngestableUrl } from '../utils/platform-category';

const VALID_CATEGORIES = new Set<PlatformType>([
  'dsp',
  'social',
  'earnings',
  'websites',
  'custom',
]);

function normalizeCategory(
  rawCategory: PlatformType | undefined
): PlatformType {
  return rawCategory && VALID_CATEGORIES.has(rawCategory)
    ? rawCategory
    : 'custom';
}

function normalizeLinkItem(item: LinkItem, index: number): LinkItem {
  const category = normalizeCategory(
    item.platform.category as PlatformType | undefined
  );
  return {
    ...item,
    platform: { ...item.platform, category },
    category,
    order: typeof item.order === 'number' ? item.order : index,
  };
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
  debouncedSave: ReturnType<typeof debounce> & {
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
      const normalized = input.map(normalizeLinkItem);

      try {
        const payload = normalized.map((l, index) => ({
          platform: l.platform.id,
          platformType: l.platform.category,
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
            error?: string;
            code?: string;
            currentVersion?: number;
          } | null;

          // Update version from conflict response
          if (
            conflictData?.currentVersion &&
            typeof conflictData.currentVersion === 'number'
          ) {
            setLinksVersion(conflictData.currentVersion);
          }

          // Show conflict message and trigger refresh
          toast.error(
            'Your links were updated in another tab. Refreshing to show the latest version.',
            { duration: 5000 }
          );

          // Sync from server to get the latest state
          await onSyncSuggestions?.();
          return;
        }

        if (!response.ok) {
          let message = 'Failed to save links';
          try {
            const data = (await response.json().catch(() => null)) as {
              error?: string;
            } | null;
            if (data?.error && typeof data.error === 'string') {
              message = data.error;
            }
          } catch {
            // swallow JSON parse errors and fall back to default message
          }
          throw new Error(message);
        }

        // Parse success response and update version
        const successData = (await response.json().catch(() => null)) as {
          ok?: boolean;
          version?: number;
        } | null;
        if (successData?.version && typeof successData.version === 'number') {
          setLinksVersion(successData.version);
        }

        // Keep normalized links locally; server IDs will be applied on next load
        setLinks(prev =>
          areLinkItemsEqual(prev, normalized) ? prev : normalized
        );

        // Check for ingestable URLs and trigger suggestion sync
        if (suggestionsEnabled) {
          const hasIngestableLink = normalized.some(item =>
            isIngestableUrl(item.normalizedUrl)
          );

          if (hasIngestableLink) {
            setAutoRefreshUntilMs(Date.now() + 20000);
            void onSyncSuggestions?.();
          }
        }

        const now = new Date();
        toast.success(
          `Links saved successfully. Last saved: ${now.toLocaleTimeString()}`
        );
      } catch (error) {
        console.error('Error saving links:', error);
        const message =
          error instanceof Error ? error.message : 'Failed to save links';
        toast.error(message || 'Failed to save links. Please try again.');
      }
    },
    [profileId, suggestionsEnabled, onSyncSuggestions, linksVersion]
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

  // Debounced save function
  const debouncedSave = useMemo(
    () =>
      debounce((...args: unknown[]) => {
        const [input] = args as [LinkItem[]];
        enqueueSave(input);
      }, debounceMs),
    [enqueueSave, debounceMs]
  );

  // Cancel pending saves when profileId changes
  useEffect(() => {
    return () => {
      debouncedSave.cancel();
    };
  }, [debouncedSave]);

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
