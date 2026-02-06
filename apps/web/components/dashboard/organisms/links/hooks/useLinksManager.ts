'use client';

/**
 * useLinksManager Hook
 *
 * Custom hook for managing link state including add, remove, toggle, and edit operations.
 * Handles duplicate detection, YouTube cross-category logic, and MAX_SOCIAL_LINKS visibility.
 */

import * as Sentry from '@sentry/nextjs';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { popularityIndex } from '@/constants/app';
import { fetchWithTimeout } from '@/lib/queries/fetch';
import type { DetectedLink } from '@/lib/utils/platform-detection';
import { findDuplicate, mergeDuplicate } from '../services/duplicate-detection';
import { enrichLink, getSections } from '../services/link-enrichment';
import {
  applyVisibility,
  isLinkVisible as checkLinkVisibility,
  shouldLinkBeVisible,
} from '../services/visibility-enforcement';
import {
  checkYouTubeCrossCategory,
  shouldMergeYouTubeDuplicate,
} from '../services/youtube-handler';
import { sectionOf } from '../utils';

type DuplicateResolution<T> = {
  next: T[];
  emittedLink: T | null;
};

/**
 * Resolve duplicate found after delay - determines merge vs add behavior
 */
function resolveDuplicateAfterDelay<T extends DetectedLink>(
  link: T,
  prev: T[],
  dupIndex: number,
  dupLink: T | undefined,
  section: string
): DuplicateResolution<T> {
  // No duplicate found - will add new link later
  if (dupIndex === -1 || !dupLink) {
    return { next: prev, emittedLink: null };
  }

  // Cross-section duplicates: skip merge, will add new link
  if (sectionOf(dupLink) !== section) {
    return { next: prev, emittedLink: null };
  }

  // Same section: merge the duplicate
  const merged = mergeDuplicate(dupLink, link as DetectedLink);
  const next = prev.map((l, i) => (i === dupIndex ? merged : l));
  return { next, emittedLink: merged };
}

/**
 * YouTube prompt state for cross-category placement
 */
export interface YouTubePromptState {
  candidate: DetectedLink;
  target: 'social' | 'dsp';
}

/**
 * Options for the useLinksManager hook
 */
export interface UseLinksManagerOptions<T extends DetectedLink> {
  /** Initial links to populate the state */
  initialLinks: T[];
  /** Callback when links array changes */
  onLinksChange?: (links: T[]) => void;
  /** Callback when a link is added (single link or array) */
  onLinkAdded?: (links: T[]) => void;
}

/**
 * Return type for the useLinksManager hook
 */
export interface UseLinksManagerReturn<T extends DetectedLink> {
  /** Current links array */
  links: T[];
  /** Set the links array directly */
  setLinks: React.Dispatch<React.SetStateAction<T[]>>;
  /** Add a new link with duplicate detection and YouTube handling */
  handleAdd: (link: DetectedLink) => Promise<void>;
  /** Toggle visibility of a link by index */
  handleToggle: (idx: number) => void;
  /** Remove a link by index */
  handleRemove: (idx: number) => void;
  /** Edit a link - removes it and sets prefill URL for re-adding */
  handleEdit: (idx: number) => void;
  /** Insert a link maintaining section ordering by popularity */
  insertLinkWithSectionOrdering: (existing: T[], nextLink: T) => T[];
  /** YouTube cross-category prompt state */
  ytPrompt: YouTubePromptState | null;
  /** Set YouTube prompt state */
  setYtPrompt: React.Dispatch<React.SetStateAction<YouTubePromptState | null>>;
  /** Confirm YouTube cross-category addition */
  confirmYtPrompt: () => void;
  /** Cancel YouTube cross-category prompt */
  cancelYtPrompt: () => void;
  /** ID of the last added link (for highlighting) */
  lastAddedId: string | null;
  /** Link currently being added (for loading state) */
  addingLink: T | null;
  /** Prefill URL for edit mode */
  prefillUrl: string | undefined;
  /** Set prefill URL */
  setPrefillUrl: React.Dispatch<React.SetStateAction<string | undefined>>;
  /** Clear prefill URL after consumption */
  clearPrefillUrl: () => void;
  /** Get a stable ID for a link */
  idFor: (link: T) => string;
  /** Map of link IDs to their indices */
  mapIdToIndex: Map<string, number>;
  /** Check if a link is visible */
  linkIsVisible: (link: T) => boolean;
}

/**
 * Custom hook for managing links state with full CRUD operations.
 *
 * Features:
 * - Add links with duplicate detection and merging
 * - YouTube cross-category handling (social + dsp)
 * - MAX_SOCIAL_LINKS visibility enforcement
 * - Toggle visibility, remove, and edit operations
 * - Stable IDs for DnD and menu control
 *
 * @example
 * ```tsx
 * const {
 *   links,
 *   handleAdd,
 *   handleToggle,
 *   handleRemove,
 *   ytPrompt,
 *   confirmYtPrompt,
 * } = useLinksManager({
 *   initialLinks: profileLinks,
 *   onLinksChange: (links) => saveToBackend(links),
 * });
 * ```
 */
export function useLinksManager<T extends DetectedLink = DetectedLink>({
  initialLinks,
  onLinksChange,
  onLinkAdded,
}: UseLinksManagerOptions<T>): UseLinksManagerReturn<T> {
  const [links, setLinks] = useState<T[]>(() => [...initialLinks]);
  const linksRef = useRef<T[]>(links);
  const [ytPrompt, setYtPrompt] = useState<YouTubePromptState | null>(null);
  const [lastAddedId, setLastAddedId] = useState<string | null>(null);
  const [addingLink, setAddingLink] = useState<T | null>(null);
  const [prefillUrl, setPrefillUrl] = useState<string | undefined>();

  useEffect(() => {
    linksRef.current = links;
  }, [links]);
  // Stable ID generator for links (used for DnD and menu control)
  const idFor = useCallback(
    (link: T): string =>
      `${link.platform.id}::${link.normalizedUrl || link.originalUrl || ''}`,
    []
  );

  // Map of link IDs to their indices for fast lookup
  const mapIdToIndex = useMemo(() => {
    const m = new Map<string, number>();
    links.forEach((l, idx) => {
      m.set(idFor(l), idx);
    });
    return m;
  }, [idFor, links]);

  // Check if a link is visible
  const linkIsVisible = useCallback(
    (l: T): boolean => checkLinkVisibility(l),
    []
  );

  // Clear lastAddedId after highlight duration
  useEffect(() => {
    if (!lastAddedId) return;
    const timer = setTimeout(() => setLastAddedId(null), 1400);
    return () => clearTimeout(timer);
  }, [lastAddedId]);

  // Notify parent of link changes
  useEffect(() => {
    onLinksChange?.(links);
  }, [links, onLinksChange]);

  /**
   * Insert a link while maintaining section ordering by popularity
   */
  const insertLinkWithSectionOrdering = useCallback(
    (existing: T[], nextLink: T): T[] => {
      if (existing.length === 0) return [nextLink];

      const targetSection = sectionOf(nextLink);
      const targetPopularity = popularityIndex(nextLink.platform.id);
      const next = [...existing];
      const sectionIndexes: number[] = [];

      next.forEach((link, index) => {
        if (sectionOf(link) === targetSection) {
          sectionIndexes.push(index);
        }
      });

      if (sectionIndexes.length === 0) {
        next.push(nextLink);
        return next;
      }

      const insertionIdx = sectionIndexes.find(index => {
        const existingLink = next[index];
        if (!existingLink) return false;
        return popularityIndex(existingLink.platform.id) > targetPopularity;
      });

      const insertAt = insertionIdx ?? Math.max(...sectionIndexes) + 1;
      next.splice(insertAt, 0, nextLink);
      return next;
    },
    []
  );

  /**
   * Add a new link with full duplicate detection and YouTube handling
   */
  const handleAdd = useCallback(
    async (link: DetectedLink) => {
      // Step 1: Enrich link with defaults and platform-specific adjustments
      const enriched = enrichLink<T>(link);
      const { section, otherSection } = getSections(enriched);

      // Step 2: Apply visibility rules
      const isVisible = shouldLinkBeVisible(links, section);
      const visibilityApplied = applyVisibility(enriched, isVisible);

      // Step 3: Check for duplicates and existing platform links
      const {
        duplicateIndex,
        duplicate,
        duplicateSection,
        hasCrossSectionDuplicate,
      } = findDuplicate(visibilityApplied as DetectedLink, links, section);

      const sameSectionHas = links.some(
        l =>
          l.platform.id === visibilityApplied.platform.id &&
          sectionOf(l) === section
      );
      const otherSectionHas = otherSection
        ? links.some(
            l =>
              l.platform.id === visibilityApplied.platform.id &&
              sectionOf(l) === otherSection
          )
        : false;

      // Step 4: Check YouTube cross-category logic
      const ytCrossCategory = checkYouTubeCrossCategory(
        visibilityApplied.platform.id,
        sameSectionHas,
        otherSectionHas,
        otherSection
      );

      if (ytCrossCategory.shouldSkip) return;

      if (ytCrossCategory.shouldPrompt && ytCrossCategory.targetSection) {
        setYtPrompt({
          candidate: visibilityApplied,
          target: ytCrossCategory.targetSection,
        });
        return;
      }

      // Step 5: Handle YouTube same-section duplicate merge
      if (
        shouldMergeYouTubeDuplicate(
          visibilityApplied.platform.id,
          duplicateIndex,
          duplicateSection,
          section,
          hasCrossSectionDuplicate
        )
      ) {
        const merged = mergeDuplicate(
          links[duplicateIndex] as T,
          visibilityApplied as DetectedLink
        );
        const next = links.map((l, i) => (i === duplicateIndex ? merged : l));
        setLinks(next);
        onLinkAdded?.([merged]);
        return;
      }

      // Step 6: Handle non-YouTube duplicate merge
      if (duplicateIndex !== -1 && !hasCrossSectionDuplicate) {
        const merged = mergeDuplicate(
          duplicate as T,
          visibilityApplied as DetectedLink
        );
        const next = links.map((l, i) => (i === duplicateIndex ? merged : l));
        setLinks(next);
        onLinkAdded?.([merged]);
        return;
      }

      // Step 7: Skip if already exists in section (non-YouTube)
      if (visibilityApplied.platform.id !== 'youtube' && sameSectionHas) {
        return;
      }

      // Step 8: Show loading placeholder
      setAddingLink(visibilityApplied);
      await new Promise(resolve => setTimeout(resolve, 600));

      // Step 9: Re-check for duplicates after delay
      const prev = linksRef.current;
      const { duplicateIndex: dupAfterDelay, duplicate: duplicateAfterDelay } =
        findDuplicate(visibilityApplied as DetectedLink, prev, section);

      // Step 10: Handle duplicate found after delay
      const resolution = resolveDuplicateAfterDelay(
        visibilityApplied,
        prev,
        dupAfterDelay,
        duplicateAfterDelay as T | undefined,
        section
      );

      let { next, emittedLink } = resolution;

      // Step 11: Add new link if no merge happened
      if (!emittedLink) {
        const adjusted = applyVisibility(
          visibilityApplied,
          shouldLinkBeVisible(prev, section)
        );
        next = [...prev, adjusted];
        emittedLink = adjusted;
      }

      // Step 12: Update state and notify
      setLinks(next);
      setLastAddedId(idFor(emittedLink));
      onLinkAdded?.([emittedLink]);
      setAddingLink(null);

      // Step 13: Enable tipping if Venmo (non-blocking)
      if (visibilityApplied.platform.id === 'venmo') {
        fetchWithTimeout('/api/dashboard/tipping/enable', {
          method: 'POST',
        }).catch(error => {
          Sentry.captureException(error, {
            tags: { feature: 'tipping', action: 'enable' },
          });
        });
      }
    },
    [links, idFor, onLinkAdded]
  );

  /**
   * Toggle visibility of a link by index
   */
  const handleToggle = useCallback((idx: number) => {
    setLinks(prev => {
      const next = [...prev];
      const curr = next[idx] as unknown as { isVisible?: boolean };
      next[idx] = {
        ...next[idx],
        isVisible: !(curr?.isVisible ?? true),
      } as unknown as T;
      return next;
    });
  }, []);

  /**
   * Remove a link by index
   */
  const handleRemove = useCallback((idx: number) => {
    setLinks(prev => prev.filter((_, i) => i !== idx));
  }, []);

  /**
   * Edit a link - sets prefill URL and removes the link for re-adding
   */
  const handleEdit = useCallback(
    (idx: number) => {
      const link = links[idx];
      if (!link) return;
      setPrefillUrl(link.normalizedUrl || link.originalUrl);
      setLinks(prev => prev.filter((_, i) => i !== idx));
    },
    [links]
  );

  /**
   * Confirm YouTube cross-category addition
   */
  const confirmYtPrompt = useCallback(() => {
    if (!ytPrompt) return;
    const adjusted = {
      ...ytPrompt.candidate,
      platform: {
        ...ytPrompt.candidate.platform,
        category: ytPrompt.target,
      },
    } as unknown as T;
    const next = [...links, adjusted];
    setLinks(next);
    setYtPrompt(null);
    onLinkAdded?.([adjusted]);
  }, [ytPrompt, links, onLinkAdded]);

  /**
   * Cancel YouTube cross-category prompt
   */
  const cancelYtPrompt = useCallback(() => {
    setYtPrompt(null);
  }, []);

  /**
   * Clear prefill URL after consumption
   */
  const clearPrefillUrl = useCallback(() => {
    setPrefillUrl(undefined);
  }, []);

  return {
    links,
    setLinks,
    handleAdd,
    handleToggle,
    handleRemove,
    handleEdit,
    insertLinkWithSectionOrdering,
    ytPrompt,
    setYtPrompt,
    confirmYtPrompt,
    cancelYtPrompt,
    lastAddedId,
    addingLink,
    prefillUrl,
    setPrefillUrl,
    clearPrefillUrl,
    idFor,
    mapIdToIndex,
    linkIsVisible,
  };
}
