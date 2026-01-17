/**
 * useLinksManager Hook
 *
 * Custom hook for managing link state including add, remove, toggle, and edit operations.
 * Handles duplicate detection, YouTube cross-category logic, and MAX_SOCIAL_LINKS visibility.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { MAX_SOCIAL_LINKS, popularityIndex } from '@/constants/app';
import {
  canonicalIdentity,
  type DetectedLink,
} from '@/lib/utils/platform-detection';
import { sectionOf } from '../utils';

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
    (l: T): boolean =>
      ((l as unknown as { isVisible?: boolean }).isVisible ?? true) !== false,
    []
  );

  // Clear lastAddedId after highlight duration
  useEffect(() => {
    if (!lastAddedId) return;
    const timer = window.setTimeout(() => setLastAddedId(null), 1400);
    return () => window.clearTimeout(timer);
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
        if (sectionOf(link as T) === targetSection) {
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
        return (
          popularityIndex((existingLink as DetectedLink).platform.id) >
          targetPopularity
        );
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
      const enriched = {
        isVisible: true,
        ...link,
      } as unknown as T;

      // Special handling for Venmo - force earnings category
      if ((enriched as DetectedLink).platform.id === 'venmo') {
        (enriched as DetectedLink).platform = {
          ...(enriched as DetectedLink).platform,
          category: 'earnings' as unknown as 'social',
        } as DetectedLink['platform'];
      }

      const section = sectionOf(enriched as T);

      // Enforce MAX_SOCIAL_LINKS visibility
      const socialVisibleCount = links.filter(
        l => sectionOf(l as T) === 'social' && linkIsVisible(l as T)
      ).length;
      if (section === 'social' && socialVisibleCount >= MAX_SOCIAL_LINKS) {
        (enriched as unknown as { isVisible?: boolean }).isVisible = false;
      }

      // Check for existing links in same/other sections
      const otherSection: 'social' | 'dsp' | null =
        section === 'social' ? 'dsp' : section === 'dsp' ? 'social' : null;
      const sameSectionHas = links.some(
        l => l.platform.id === enriched.platform.id && sectionOf(l) === section
      );
      const otherSectionHas = otherSection
        ? links.some(
            l =>
              l.platform.id === enriched.platform.id &&
              sectionOf(l) === otherSection
          )
        : false;

      // Duplicate detection
      const canonicalId = canonicalIdentity({
        platform: (enriched as DetectedLink).platform,
        normalizedUrl: (enriched as DetectedLink).normalizedUrl,
      });
      const dupAt = links.findIndex(
        l =>
          canonicalIdentity({
            platform: (l as DetectedLink).platform,
            normalizedUrl: (l as DetectedLink).normalizedUrl,
          }) === canonicalId
      );
      const duplicate = dupAt !== -1 ? links[dupAt] : null;
      const duplicateSection = duplicate ? sectionOf(duplicate as T) : null;
      const hasCrossSectionDuplicate =
        enriched.platform.id === 'youtube' &&
        duplicateSection !== null &&
        duplicateSection !== section;

      // YouTube: already in this section, prompt for other section
      if (
        enriched.platform.id === 'youtube' &&
        sameSectionHas &&
        !otherSectionHas &&
        otherSection
      ) {
        setYtPrompt({ candidate: enriched, target: otherSection });
        return;
      }

      // YouTube: same section duplicate - merge URL/title
      if (
        enriched.platform.id === 'youtube' &&
        dupAt !== -1 &&
        duplicateSection === section
      ) {
        const merged = {
          ...links[dupAt],
          normalizedUrl: (enriched as DetectedLink).normalizedUrl,
          suggestedTitle: (enriched as DetectedLink).suggestedTitle,
        } as T;
        const next = links.map((l, i) => (i === dupAt ? merged : l));
        setLinks(next);
        onLinkAdded?.([merged]);
        return;
      }

      // Non-YouTube duplicate - merge
      if (dupAt !== -1 && !hasCrossSectionDuplicate) {
        const merged = {
          ...links[dupAt],
          normalizedUrl: (enriched as DetectedLink).normalizedUrl,
          suggestedTitle: (enriched as DetectedLink).suggestedTitle,
        } as T;
        const next = links.map((l, i) => (i === dupAt ? merged : l));
        setLinks(next);
        onLinkAdded?.([merged]);
        return;
      }

      // YouTube: already in both sections
      if (enriched.platform.id === 'youtube') {
        if (sameSectionHas && otherSectionHas) {
          return;
        }
      } else if (sameSectionHas) {
        return;
      }

      // Show loading placeholder
      setAddingLink(enriched);
      await new Promise(resolve => setTimeout(resolve, 600));

      const prev = linksRef.current;
      const currentSection = sectionOf(enriched as T);
      const canonicalIdAfterDelay = canonicalIdentity({
        platform: (enriched as DetectedLink).platform,
        normalizedUrl: (enriched as DetectedLink).normalizedUrl,
      });

      const dupAtAfterDelay = prev.findIndex(
        existing =>
          canonicalIdentity({
            platform: (existing as DetectedLink).platform,
            normalizedUrl: (existing as DetectedLink).normalizedUrl,
          }) === canonicalIdAfterDelay
      );

      let next = prev;
      let didAdd = false;
      let didMerge = false;
      let emittedLink: T | null = null;

      if (dupAtAfterDelay !== -1) {
        const duplicate = prev[dupAtAfterDelay];
        if (duplicate) {
          const duplicateSection = sectionOf(duplicate);

          if (
            (enriched as DetectedLink).platform.id !== 'youtube' &&
            duplicateSection !== currentSection
          ) {
            // Cross-section duplicates are not allowed (except YouTube)
            emittedLink = null;
          } else if (
            (enriched as DetectedLink).platform.id === 'youtube' &&
            duplicateSection !== currentSection
          ) {
            // Allow YouTube to exist in both social + dsp: treat as add
          } else {
            const merged = {
              ...duplicate,
              normalizedUrl: (enriched as DetectedLink).normalizedUrl,
              suggestedTitle: (enriched as DetectedLink).suggestedTitle,
            } as T;
            next = prev.map((l, i) => (i === dupAtAfterDelay ? merged : l));
            emittedLink = merged;
            didMerge = true;
          }
        }
      }

      if (!emittedLink) {
        const socialVisibleCount = prev.filter(
          existing =>
            sectionOf(existing) === 'social' && linkIsVisible(existing)
        ).length;

        const adjusted = { ...enriched } as unknown as T;
        if (
          currentSection === 'social' &&
          socialVisibleCount >= MAX_SOCIAL_LINKS
        ) {
          (adjusted as unknown as { isVisible?: boolean }).isVisible = false;
        }

        next = [...prev, adjusted];
        emittedLink = adjusted;
        didAdd = true;
      }

      if (emittedLink) {
        setLinks(next);
        setLastAddedId(idFor(emittedLink));
        if (didAdd || didMerge) {
          onLinkAdded?.([emittedLink]);
        }
      }
      setAddingLink(null);

      // Non-blocking: enable tipping if Venmo was added
      if ((enriched as DetectedLink).platform.id === 'venmo') {
        fetch('/api/dashboard/tipping/enable', { method: 'POST' }).catch(() => {
          // Non-blocking: ignore errors
        });
      }
    },
    [links, linkIsVisible, idFor, onLinkAdded]
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
