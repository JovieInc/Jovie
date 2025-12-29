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
  getLinkVisibility,
  type ManagedLink,
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

  // Check if a link is visible using type-safe helper
  const linkIsVisible = useCallback(
    (l: T): boolean => getLinkVisibility(l),
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
      // Create a managed link with visibility tracking
      const enriched: ManagedLink = {
        ...link,
        isVisible: true,
      };

      // Special handling for Venmo - force earnings category
      if (enriched.platform.id === 'venmo') {
        enriched.platform = {
          ...enriched.platform,
          category: 'earnings',
        };
      }

      const section = sectionOf(enriched);

      // Enforce MAX_SOCIAL_LINKS visibility
      const socialVisibleCount = links.filter(
        l => sectionOf(l) === 'social' && linkIsVisible(l)
      ).length;
      if (section === 'social' && socialVisibleCount >= MAX_SOCIAL_LINKS) {
        enriched.isVisible = false;
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

      // Duplicate detection - ManagedLink extends DetectedLink, so canonicalIdentity works directly
      const canonicalId = canonicalIdentity({
        platform: enriched.platform,
        normalizedUrl: enriched.normalizedUrl,
      });
      const dupAt = links.findIndex(
        l =>
          canonicalIdentity({
            platform: l.platform,
            normalizedUrl: l.normalizedUrl,
          }) === canonicalId
      );
      const duplicate = dupAt !== -1 ? links[dupAt] : null;
      const duplicateSection = duplicate ? sectionOf(duplicate) : null;
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
        const existingLink = links[dupAt];
        if (existingLink) {
          const merged: T = {
            ...existingLink,
            normalizedUrl: enriched.normalizedUrl,
            suggestedTitle: enriched.suggestedTitle,
          };
          const next = links.map((l, i) => (i === dupAt ? merged : l));
          setLinks(next);
          onLinkAdded?.([merged]);
        }
        return;
      }

      // Non-YouTube duplicate - merge
      if (dupAt !== -1 && !hasCrossSectionDuplicate) {
        const existingLink = links[dupAt];
        if (existingLink) {
          const merged: T = {
            ...existingLink,
            normalizedUrl: enriched.normalizedUrl,
            suggestedTitle: enriched.suggestedTitle,
          };
          const next = links.map((l, i) => (i === dupAt ? merged : l));
          setLinks(next);
          onLinkAdded?.([merged]);
        }
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

      // Show loading placeholder - cast to T since ManagedLink is compatible
      setAddingLink(enriched as T & ManagedLink);
      await new Promise(resolve => setTimeout(resolve, 600));

      const prev = linksRef.current;
      const currentSection = sectionOf(enriched);
      const canonicalIdAfterDelay = canonicalIdentity({
        platform: enriched.platform,
        normalizedUrl: enriched.normalizedUrl,
      });

      const dupAtAfterDelay = prev.findIndex(
        existing =>
          canonicalIdentity({
            platform: existing.platform,
            normalizedUrl: existing.normalizedUrl,
          }) === canonicalIdAfterDelay
      );

      let next = prev;
      let didAdd = false;
      let didMerge = false;
      let emittedLink: T | null = null;

      if (dupAtAfterDelay !== -1) {
        const existingDuplicate = prev[dupAtAfterDelay];
        if (existingDuplicate) {
          const existingDupSection = sectionOf(existingDuplicate);

          if (
            enriched.platform.id !== 'youtube' &&
            existingDupSection !== currentSection
          ) {
            // Cross-section duplicates are not allowed (except YouTube)
            emittedLink = null;
          } else if (
            enriched.platform.id === 'youtube' &&
            existingDupSection !== currentSection
          ) {
            // Allow YouTube to exist in both social + dsp: treat as add
          } else {
            const merged: T = {
              ...existingDuplicate,
              normalizedUrl: enriched.normalizedUrl,
              suggestedTitle: enriched.suggestedTitle,
            };
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

        // Create adjusted link with proper visibility
        const adjusted: ManagedLink = { ...enriched };
        if (
          currentSection === 'social' &&
          socialVisibleCount >= MAX_SOCIAL_LINKS
        ) {
          adjusted.isVisible = false;
        }

        next = [...prev, adjusted as T & ManagedLink];
        emittedLink = adjusted as T & ManagedLink;
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
      try {
        if (enriched.platform.id === 'venmo') {
          void fetch('/api/dashboard/tipping/enable', { method: 'POST' });
        }
      } catch {
        // non-blocking
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
      const current = next[idx];
      if (!current) return prev;
      // T extends DetectedLink, and we're adding isVisible which makes it compatible with ManagedLink
      const currentVisibility = getLinkVisibility(current);
      next[idx] = { ...current, isVisible: !currentVisibility } as T &
        ManagedLink;
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
    // Create adjusted link with new category - ManagedLink is compatible with T
    const adjusted: ManagedLink = {
      ...ytPrompt.candidate,
      platform: {
        ...ytPrompt.candidate.platform,
        category: ytPrompt.target,
      },
    };
    const next = [...links, adjusted as T & ManagedLink];
    setLinks(next);
    setYtPrompt(null);
    onLinkAdded?.([adjusted as T & ManagedLink]);
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
