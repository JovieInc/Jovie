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
import { APP_ROUTES } from '@/constants/routes';
import { track } from '@/lib/analytics';
import { captureError } from '@/lib/error-tracking';
import { FetchError, fetchWithTimeout } from '@/lib/queries/fetch';
import { queryKeys } from '@/lib/queries/keys';
import type { LinkItem, PlatformType, SuggestedLink } from '../types';
import {
  areLinkItemsEqual,
  convertDbLinksToLinkItems,
  convertDbLinksToSuggestions,
} from '../utils/link-transformers';
import { isIngestableUrl } from '../utils/platform-category';

/**
 * Response type for social links save API
 */
interface SaveLinksResponse {
  version?: number;
  currentVersion?: number;
  error?: string;
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
 * Normalize a link item's category
 */
function normalizeCategory(category: string | undefined): PlatformType {
  const validCategories: PlatformType[] = [
    'dsp',
    'social',
    'earnings',
    'websites',
    'custom',
  ];
  return validCategories.includes(category as PlatformType)
    ? (category as PlatformType)
    : 'custom';
}

/**
 * Normalize link items for persistence
 */
function normalizeLinkItems(input: LinkItem[]): LinkItem[] {
  return input.map((item, index) => ({
    ...item,
    platform: {
      ...item.platform,
      category: normalizeCategory(item.platform.category as string | undefined),
    },
    category: normalizeCategory(item.platform.category as string | undefined),
    order: typeof item.order === 'number' ? item.order : index,
  }));
}

/**
 * Build API payload from normalized links
 */
function buildSavePayload(normalized: LinkItem[]) {
  return normalized.map((l, index) => ({
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
}

/** Default error message for failed saves */
const DEFAULT_SAVE_ERROR = 'Failed to save links. Please try again.';

/**
 * Get error message for FetchError based on status code
 */
function getFetchErrorMessage(error: FetchError): string {
  if (error.status === 408) {
    return 'Request timed out. Please try again.';
  }
  if (error.status >= 500) {
    return 'Server error. Please try again later.';
  }
  return error.message || DEFAULT_SAVE_ERROR;
}

/**
 * Extract user-friendly error message from error
 */
function extractErrorMessage(error: unknown): string {
  if (error instanceof FetchError) {
    return getFetchErrorMessage(error);
  }
  if (error instanceof Error && error.message) {
    return error.message;
  }
  return DEFAULT_SAVE_ERROR;
}

/**
 * Parameters for processSaveSuccess
 */
interface ProcessSaveSuccessParams {
  successData: SaveLinksResponse;
  normalized: LinkItem[];
  profileId: string | undefined;
  suggestionsEnabled: boolean;
  setLinksVersion: React.Dispatch<React.SetStateAction<number>>;
  setLinks: React.Dispatch<React.SetStateAction<LinkItem[]>>;
  setAutoRefreshUntilMs: React.Dispatch<React.SetStateAction<number | null>>;
  onSyncSuggestions: (() => Promise<void>) | undefined;
  queryClient: ReturnType<typeof useQueryClient>;
}

/**
 * Process a successful save response (module-level to reduce hook CC)
 */
function processSaveSuccess({
  successData,
  normalized,
  profileId,
  suggestionsEnabled,
  setLinksVersion,
  setLinks,
  setAutoRefreshUntilMs,
  onSyncSuggestions,
  queryClient,
}: ProcessSaveSuccessParams): void {
  const newVersion = parseVersionFromBody(successData);
  if (newVersion !== null) {
    setLinksVersion(newVersion);
  }

  setLinks(prev => (areLinkItemsEqual(prev, normalized) ? prev : normalized));

  if (suggestionsEnabled && hasIngestableLink(normalized)) {
    setAutoRefreshUntilMs(Date.now() + 20000);
    onSyncSuggestions?.().catch((err: unknown) => {
      track('dashboard_social_links_sync_failed', {
        profileId,
        error: String(err),
      });
    });
  }

  if (profileId) {
    queryClient.invalidateQueries({
      queryKey: queryKeys.dashboard.socialLinks(profileId),
    });
    queryClient.invalidateQueries({
      queryKey: queryKeys.suggestions.list(profileId),
    });
  }

  track('dashboard_social_links_saved', { profileId });

  const now = new Date();
  toast.success(
    `Links saved successfully. Last saved: ${now.toLocaleTimeString()}`
  );
}

/**
 * Parameters for executePersistLinks
 */
interface ExecutePersistLinksParams {
  input: LinkItem[];
  profileId: string | undefined;
  linksVersion: number;
  onSuccess: (data: SaveLinksResponse, normalized: LinkItem[]) => void;
  onConflict: () => Promise<void>;
}

/**
 * Execute a single persist-links API call (module-level to reduce hook CC)
 */
async function executePersistLinks({
  input,
  profileId,
  linksVersion,
  onSuccess,
  onConflict,
}: ExecutePersistLinksParams): Promise<void> {
  const normalized = normalizeLinkItems(input);

  if (!profileId) {
    toast.error('Unable to save links. Please refresh and try again.');
    return;
  }

  try {
    const payload = buildSavePayload(normalized);

    const successData = await fetchWithTimeout<SaveLinksResponse>(
      '/api/dashboard/social-links',
      {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          profileId,
          links: payload,
          expectedVersion: linksVersion,
        }),
        timeout: 15000,
      }
    );

    onSuccess(successData, normalized);
  } catch (error) {
    if (error instanceof FetchError && error.status === 409) {
      await onConflict();
      return;
    }

    void captureError('Failed to save social links', error, {
      profileId,
      linkCount: normalized.length,
      route: APP_ROUTES.PROFILE,
    });

    toast.error(extractErrorMessage(error));
  }
}

/**
 * Run the save queue loop, draining pending saves sequentially
 */
async function runSaveLoop(
  pendingSaveRef: React.MutableRefObject<LinkItem[] | null>,
  saveLoopRunningRef: React.MutableRefObject<boolean>,
  persist: (input: LinkItem[]) => Promise<void>
): Promise<void> {
  try {
    while (pendingSaveRef.current) {
      const next = pendingSaveRef.current;
      pendingSaveRef.current = null;
      await persist(next);
    }
  } finally {
    saveLoopRunningRef.current = false;
  }
}

/**
 * Create a debounced save function with cancel and flush methods
 */
function createDebouncedSave(
  asyncDebouncer: {
    maybeExecute: (input: LinkItem[]) => void;
    cancel: () => void;
  },
  lastInputRef: React.MutableRefObject<LinkItem[] | null>,
  enqueueSave: (input: LinkItem[]) => void
): { (input: LinkItem[]): void; flush: () => void; cancel: () => void } {
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
 * Calculate initial version from links array
 */
function calculateInitialVersion(links: ProfileSocialLink[]): number {
  const versions = links
    .map(l => l.version ?? 1)
    .filter(v => typeof v === 'number');
  return versions.length > 0 ? Math.max(...versions) : 0;
}

/**
 * Check if any link has an ingestable URL
 */
function hasIngestableLink(links: LinkItem[]): boolean {
  return links.some(item => isIngestableUrl(item.normalizedUrl));
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
  const [linksVersion, setLinksVersion] = useState<number>(() =>
    calculateInitialVersion(activeInitialLinks || [])
  );

  // Ref for async access to links
  const linksRef = useRef<LinkItem[]>(links);
  useEffect(() => {
    linksRef.current = links;
  }, [links]);

  // Ref for async access to linksVersion (avoids stale closure in queued saves)
  const linksVersionRef = useRef<number>(linksVersion);
  useEffect(() => {
    linksVersionRef.current = linksVersion;
  }, [linksVersion]);

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

  // Handle successful save response
  const handleSaveSuccess = useCallback(
    (successData: SaveLinksResponse, normalized: LinkItem[]) => {
      processSaveSuccess({
        successData,
        normalized,
        profileId,
        suggestionsEnabled,
        setLinksVersion,
        setLinks,
        setAutoRefreshUntilMs,
        onSyncSuggestions,
        queryClient,
      });
    },
    [profileId, suggestionsEnabled, onSyncSuggestions, queryClient]
  );

  // Handle 409 conflict error
  const handleConflictError = useCallback(async () => {
    toast.error(
      'Your links were updated in another tab. Syncing suggestions and refreshing.',
      { duration: 5000 }
    );
    try {
      await onSyncSuggestions?.();
      await queryClient.invalidateQueries({ queryKey: ['links'] });
    } catch (syncError) {
      void captureError('Failed to sync suggestions after 409', syncError, {
        profileId,
      });
    }
  }, [onSyncSuggestions, queryClient, profileId]);

  // Persist links to server
  const persistLinks = useCallback(
    async (input: LinkItem[]): Promise<void> => {
      await executePersistLinks({
        input,
        profileId,
        linksVersion: linksVersionRef.current,
        onSuccess: handleSaveSuccess,
        onConflict: handleConflictError,
      });
    },
    [profileId, handleSaveSuccess, handleConflictError]
  );

  // Enqueue a save, ensuring we never write older state after newer state
  const enqueueSave = useCallback(
    (input: LinkItem[]): void => {
      pendingSaveRef.current = input;

      if (saveLoopRunningRef.current) return;
      saveLoopRunningRef.current = true;

      void runSaveLoop(pendingSaveRef, saveLoopRunningRef, persistLinks);
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
  const debouncedSave = useMemo(
    () => createDebouncedSave(asyncDebouncer, lastInputRef, enqueueSave),
    [asyncDebouncer, enqueueSave]
  );

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
    // eslint-disable-next-line react-hooks/exhaustive-deps -- Cleanup-only effect: runs once on unmount to flush pending saves
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
