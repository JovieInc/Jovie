'use client';
import {
  DndContext,
  type DragEndEvent,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import { arrayMove, SortableContext, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Button } from '@jovie/ui';
import { AnimatePresence, motion } from 'framer-motion';
import { Plus, X } from 'lucide-react';
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { PlatformPill } from '@/components/dashboard/atoms/PlatformPill';
import { UniversalLinkInput } from '@/components/dashboard/molecules/UniversalLinkInput';
import { MAX_SOCIAL_LINKS, popularityIndex } from '@/constants/app';
import { track } from '@/lib/analytics';
import { cn } from '@/lib/utils';
// getBrandIconStyles reserved for future brand-colored icons
import '@/lib/utils/color';
import {
  canonicalIdentity,
  type DetectedLink,
} from '@/lib/utils/platform-detection';
import { CategorySection } from '../atoms/CategorySection';
import {
  LinkPill,
  type LinkPillMenuItem,
  type LinkPillState,
} from '../atoms/LinkPill';

type LinkSection = 'social' | 'dsp' | 'earnings' | 'custom';

export interface GroupedLinksManagerProps<
  T extends DetectedLink = DetectedLink,
> {
  initialLinks: T[];
  className?: string;
  onLinksChange?: (links: T[]) => void;
  onLinkAdded?: (links: T[]) => void;
  creatorName?: string; // For personalized link titles
  isMusicProfile?: boolean; // Hint for DSP-forward suggestions
  suggestedLinks?: Array<
    T & {
      suggestionId?: string;
      state?: 'active' | 'suggested' | 'rejected';
      confidence?: number | null;
      sourcePlatform?: string | null;
      sourceType?: string | null;
      evidence?: { sources?: string[]; signals?: string[] } | null;
    }
  >;
  onAcceptSuggestion?: (
    suggestion: T & {
      suggestionId?: string;
    }
  ) => Promise<DetectedLink | null> | DetectedLink | null | void;
  onDismissSuggestion?: (
    suggestion: T & {
      suggestionId?: string;
    }
  ) => Promise<void> | void;
  suggestionsEnabled?: boolean;
}

// Client Component scaffold for a single, grouped Links Manager
// Phase 2: wire minimal callbacks for DashboardLinks integration.
// Configurable cross-category policy (extend here to allow more platforms to span sections)
export const CROSS_CATEGORY: Record<
  string,
  Array<'social' | 'dsp' | 'earnings' | 'websites' | 'custom'>
> = {
  youtube: ['social', 'dsp'],
  // soundcloud: ['social', 'dsp'],
};

interface SuggestionPillConfig {
  id: string; // platform-detection id
  label: string;
  simpleIconId: string; // Simple Icons key for SocialIcon/getPlatformIcon
}

const SUGGESTION_PILLS: SuggestionPillConfig[] = [
  { id: 'spotify-artist', label: 'Spotify Artist', simpleIconId: 'spotify' },
  { id: 'spotify', label: 'Spotify', simpleIconId: 'spotify' },
  { id: 'apple-music', label: 'Apple Music', simpleIconId: 'applemusic' },
  {
    id: 'youtube-music',
    label: 'YouTube Music',
    simpleIconId: 'youtube',
  },
  { id: 'instagram', label: 'Instagram', simpleIconId: 'instagram' },
  { id: 'tiktok', label: 'TikTok', simpleIconId: 'tiktok' },
  { id: 'youtube', label: 'YouTube', simpleIconId: 'youtube' },
  { id: 'twitter', label: 'X / Twitter', simpleIconId: 'x' },
  { id: 'venmo', label: 'Venmo', simpleIconId: 'venmo' },
  { id: 'website', label: 'Website', simpleIconId: 'website' },
];

const MUSIC_FIRST_ORDER = [
  'spotify-artist',
  'spotify',
  'apple-music',
  'youtube',
  'youtube-music',
  'instagram',
  'tiktok',
  'twitter',
  'venmo',
  'website',
] as const;

const SOCIAL_FIRST_ORDER = [
  'instagram',
  'tiktok',
  'youtube',
  'twitter',
  'spotify',
  'apple-music',
  'youtube-music',
  'venmo',
  'website',
] as const;

export function GroupedLinksManager<T extends DetectedLink = DetectedLink>({
  initialLinks,
  className,
  onLinksChange,
  onLinkAdded,
  creatorName,
  isMusicProfile = false,
  suggestedLinks = [],
  onAcceptSuggestion,
  onDismissSuggestion,
  suggestionsEnabled = false,
}: GroupedLinksManagerProps<T>) {
  const [links, setLinks] = useState<T[]>(() => [...initialLinks]);

  // Ensure only one action menu is open at a time
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const handleAnyMenuOpen = useCallback((id: string | null) => {
    setOpenMenuId(id);
  }, []);

  // Pointer sensors for drag-and-drop (hook must be top-level)
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } })
  );

  const containerRef = useRef<HTMLDivElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- reserved for future collapse animation
  const [_collapsedInitialized, _setCollapsedInitialized] = useState(false);
  const [ytPrompt, setYtPrompt] = useState<{
    candidate: DetectedLink;
    target: 'social' | 'dsp';
  } | null>(null);
  const [lastAddedId, setLastAddedId] = useState<string | null>(null);
  const [hint, setHint] = useState<string | null>(null);
  const [addingLink, setAddingLink] = useState<T | null>(null);
  const [pendingPreview, setPendingPreview] = useState<{
    link: DetectedLink;
    isDuplicate: boolean;
  } | null>(null);
  const [clearSignal, setClearSignal] = useState(0);

  const [prefillUrl, setPrefillUrl] = useState<string | undefined>();
  const [pendingSuggestions, setPendingSuggestions] = useState(
    () => suggestedLinks
  );

  const suggestedLinksSignature = useMemo(() => {
    const keys = suggestedLinks
      .map(s => s.suggestionId || `${s.platform.id}::${s.normalizedUrl}`)
      .sort();
    return keys.join('|');
  }, [suggestedLinks]);

  const prevSuggestedLinksSignatureRef = useRef<string>(
    suggestedLinksSignature
  );

  useEffect(() => {
    if (prevSuggestedLinksSignatureRef.current === suggestedLinksSignature) {
      return;
    }
    prevSuggestedLinksSignatureRef.current = suggestedLinksSignature;
    setPendingSuggestions(suggestedLinks);
  }, [suggestedLinks, suggestedLinksSignature]);

  const groups = useMemo(() => groupLinks(links), [links]);

  // Stable ids for DnD + menu control
  const idFor = useCallback(
    (link: T): string =>
      `${link.platform.id}::${link.normalizedUrl || link.originalUrl || ''}`,
    []
  );

  const mapIdToIndex = useMemo(() => {
    const m = new Map<string, number>();
    links.forEach((l, idx) => {
      m.set(idFor(l), idx);
    });
    return m;
  }, [idFor, links]);

  const sectionOf = useCallback((link: T): LinkSection => {
    const category = (link.platform.category ?? 'custom') as
      | 'social'
      | 'dsp'
      | 'earnings'
      | 'websites'
      | 'custom';

    if (category === 'social') return 'social';
    if (category === 'dsp') return 'dsp';
    if (category === 'earnings') return 'earnings';
    return 'custom';
  }, []);

  const canMoveTo = useCallback(
    (link: T, target: LinkSection): boolean => {
      const current = sectionOf(link);
      if (current === target) return true;
      const allowed = CROSS_CATEGORY[link.platform.id] ?? [];
      return allowed.includes(target);
    },
    [sectionOf]
  );

  useEffect(() => {
    if (!lastAddedId) return;
    const timer = window.setTimeout(() => setLastAddedId(null), 1400);
    return () => window.clearTimeout(timer);
  }, [lastAddedId]);

  const linkIsVisible = (l: T): boolean =>
    ((l as unknown as { isVisible?: boolean }).isVisible ?? true) !== false;

  useEffect(() => {
    onLinksChange?.(links);
  }, [links, onLinksChange]);

  async function handleAdd(link: DetectedLink) {
    const enriched = {
      isVisible: true,
      ...link,
    } as unknown as T;

    if ((enriched as DetectedLink).platform.id === 'venmo') {
      (enriched as DetectedLink).platform = {
        ...(enriched as DetectedLink).platform,
        category: 'earnings' as unknown as 'social',
      } as DetectedLink['platform'];
    }

    const section = sectionOf(enriched as T);

    const socialVisibleCount = links.filter(
      l => sectionOf(l as T) === 'social' && linkIsVisible(l as T)
    ).length;
    if (section === 'social' && socialVisibleCount >= MAX_SOCIAL_LINKS) {
      (enriched as unknown as { isVisible?: boolean }).isVisible = false;
    }

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

    if (
      enriched.platform.id === 'youtube' &&
      sameSectionHas &&
      !otherSectionHas &&
      otherSection
    ) {
      setYtPrompt({ candidate: enriched, target: otherSection });
      return;
    }

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

    if (enriched.platform.id === 'youtube') {
      if (sameSectionHas && otherSectionHas) {
        return;
      }
    } else if (sameSectionHas) {
      return;
    }

    setAddingLink(enriched);
    // Show pulsing placeholder for a moment to indicate creation
    await new Promise(resolve => setTimeout(resolve, 600));

    let didAdd = false;
    let didMerge = false;
    let emittedLink: T | null = null;
    setLinks(prev => {
      const section = sectionOf(enriched as T);
      const canonicalId = canonicalIdentity({
        platform: (enriched as DetectedLink).platform,
        normalizedUrl: (enriched as DetectedLink).normalizedUrl,
      });

      const dupAt = prev.findIndex(
        existing =>
          canonicalIdentity({
            platform: (existing as DetectedLink).platform,
            normalizedUrl: (existing as DetectedLink).normalizedUrl,
          }) === canonicalId
      );

      if (dupAt !== -1) {
        const duplicate = prev[dupAt];
        if (!duplicate) return prev;

        const duplicateSection = sectionOf(duplicate);

        if (
          enriched.platform.id === 'youtube' &&
          duplicateSection !== section
        ) {
          // Allow YouTube to exist in both social + dsp.
        } else if (duplicateSection !== section) {
          return prev;
        } else {
          const merged = {
            ...duplicate,
            normalizedUrl: (enriched as DetectedLink).normalizedUrl,
            suggestedTitle: (enriched as DetectedLink).suggestedTitle,
          } as T;
          didMerge = true;
          emittedLink = merged;
          return prev.map((l, i) => (i === dupAt ? merged : l));
        }
      }

      const socialVisibleCount = prev.filter(
        existing => sectionOf(existing) === 'social' && linkIsVisible(existing)
      ).length;

      const adjusted = { ...enriched } as unknown as T;
      if (section === 'social' && socialVisibleCount >= MAX_SOCIAL_LINKS) {
        (adjusted as unknown as { isVisible?: boolean }).isVisible = false;
      }

      didAdd = true;
      emittedLink = adjusted;
      return [...prev, adjusted];
    });

    if (emittedLink) {
      setLastAddedId(idFor(emittedLink));
      if (didAdd || didMerge) {
        onLinkAdded?.([emittedLink]);
      }
    }
    setAddingLink(null);

    try {
      if ((enriched as DetectedLink).platform.id === 'venmo') {
        void fetch('/api/dashboard/tipping/enable', { method: 'POST' });
      }
    } catch {
      // non-blocking
    }
  }

  const suggestionKey = (s: T & { suggestionId?: string }) =>
    s.suggestionId || `${s.platform.id}::${s.normalizedUrl}`;

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
    [sectionOf]
  );

  async function handleAcceptSuggestionClick(
    suggestion: (typeof pendingSuggestions)[number]
  ) {
    if (!onAcceptSuggestion) return;
    track('dashboard_link_suggestion_accept', {
      platform: suggestion.platform.id,
      sourcePlatform: suggestion.sourcePlatform ?? undefined,
      sourceType: suggestion.sourceType ?? undefined,
      confidence: suggestion.confidence ?? undefined,
      hasIdentity: Boolean(suggestionIdentity(suggestion)),
    });
    const accepted = await onAcceptSuggestion(suggestion);
    setPendingSuggestions(prev =>
      prev.filter(s => suggestionKey(s) !== suggestionKey(suggestion))
    );
    if (accepted) {
      const normalizedCategory = sectionOf(accepted as T);
      const nextLink = {
        ...(accepted as T),
        isVisible:
          (accepted as unknown as { isVisible?: boolean }).isVisible ?? true,
        state: (accepted as unknown as { state?: string }).state ?? 'active',
        platform: {
          ...(accepted as T).platform,
          category: normalizedCategory,
        },
      } as T;
      const acceptedIdentity = canonicalIdentity({
        platform: (nextLink as DetectedLink).platform,
        normalizedUrl: (nextLink as DetectedLink).normalizedUrl,
      });
      const hasDuplicate = links.some(
        existing =>
          canonicalIdentity({
            platform: (existing as DetectedLink).platform,
            normalizedUrl: (existing as DetectedLink).normalizedUrl,
          }) === acceptedIdentity
      );
      if (!hasDuplicate) {
        setLinks(prev => insertLinkWithSectionOrdering(prev, nextLink));
        setLastAddedId(idFor(nextLink));
      }
      onLinkAdded?.([nextLink]);
    }
  }

  async function handleDismissSuggestionClick(
    suggestion: (typeof pendingSuggestions)[number]
  ) {
    track('dashboard_link_suggestion_dismiss', {
      platform: suggestion.platform.id,
      sourcePlatform: suggestion.sourcePlatform ?? undefined,
      sourceType: suggestion.sourceType ?? undefined,
      confidence: suggestion.confidence ?? undefined,
      hasIdentity: Boolean(suggestionIdentity(suggestion)),
    });
    if (onDismissSuggestion) {
      await onDismissSuggestion(suggestion);
    }
    setPendingSuggestions(prev =>
      prev.filter(s => suggestionKey(s) !== suggestionKey(suggestion))
    );
  }

  function handleToggle(idx: number) {
    setLinks(prev => {
      const next = [...prev];
      const curr = next[idx] as unknown as { isVisible?: boolean };
      next[idx] = {
        ...next[idx],
        isVisible: !(curr?.isVisible ?? true),
      } as unknown as T;
      return next;
    });
  }

  function handleRemove(idx: number) {
    setLinks(prev => {
      const next = prev.filter((_, i) => i !== idx);
      return next;
    });
  }

  function handleEdit(idx: number) {
    const link = links[idx];
    if (!link) return;
    // Set the URL in the input field for editing
    setPrefillUrl(link.normalizedUrl || link.originalUrl);
    // Remove the link from the list so user can re-add it with changes
    setLinks(prev => prev.filter((_, i) => i !== idx));
  }

  function onDragEnd(ev: DragEndEvent) {
    const { active, over } = ev;
    if (!over) return;
    if (active.id === over.id) return;

    const fromIdx = mapIdToIndex.get(String(active.id));
    const toIdx = mapIdToIndex.get(String(over.id));
    if (fromIdx == null || toIdx == null) return;

    const from = links[fromIdx];
    const to = links[toIdx];
    if (!from || !to) return;
    const fromSection = sectionOf(from);
    const toSection = sectionOf(to);

    if (fromSection === toSection) {
      const next = arrayMove(links, fromIdx, toIdx);
      setLinks(next);
      onLinksChange?.(next);
      return;
    }

    if (!canMoveTo(from, toSection)) {
      const platformName = from.platform.name || from.platform.id;
      const targetLabel = labelFor(toSection);
      setHint(
        `${platformName} can’t be moved to ${targetLabel}. Only certain platforms (e.g., YouTube) can live in multiple sections.`
      );
      window.setTimeout(() => setHint(null), 2400);
      return;
    }

    const next = [...links];
    const nextCategory = (() => {
      if (
        toSection === 'social' ||
        toSection === 'dsp' ||
        toSection === 'earnings'
      ) {
        return toSection;
      }
      const currentCategory = (from.platform.category ?? 'custom') as
        | 'social'
        | 'dsp'
        | 'earnings'
        | 'websites'
        | 'custom';
      if (
        currentCategory === 'earnings' ||
        currentCategory === 'websites' ||
        currentCategory === 'custom'
      ) {
        return currentCategory;
      }
      return 'custom';
    })();

    const updated = {
      ...from,
      platform: { ...from.platform, category: nextCategory },
    } as T;
    next.splice(fromIdx, 1);
    next.splice(toIdx, 0, updated);
    setLinks(next);
    onLinksChange?.(next);
  }

  const buildPillLabel = useCallback((link: DetectedLink): string => {
    const platform = link.platform.name || link.platform.id;
    const identity = compactUrlDisplay(
      link.platform.id,
      link.normalizedUrl
    ).trim();
    const suggested = (link.suggestedTitle || '').trim();

    const cleanSuggested = (() => {
      if (!suggested) return '';
      const onIdx = suggested.toLowerCase().indexOf(' on ');
      if (onIdx !== -1) {
        return suggested.slice(0, onIdx).trim();
      }
      return suggested;
    })();

    const pickShortest = (candidates: string[]): string => {
      const filtered = candidates
        .map(s => s.trim())
        .filter(Boolean)
        .filter(s => s.length <= 28);
      if (filtered.length === 0) return platform;
      return filtered.reduce((best, next) =>
        next.length < best.length ? next : best
      );
    };

    // Prefer @handles when present.
    if (identity.startsWith('@')) {
      return pickShortest([identity]);
    }

    // Website-style labels should just be the host.
    if (link.platform.id === 'website' && identity) {
      return pickShortest([identity, platform]);
    }

    // For DSPs, the URL identity is usually just the host; prefer platform name / suggested.
    if (link.platform.category === 'dsp') {
      return pickShortest([cleanSuggested, platform]);
    }

    if (!identity) {
      return pickShortest([cleanSuggested, platform]);
    }

    return pickShortest([
      cleanSuggested,
      `${platform} • ${identity}`,
      platform,
    ]);
  }, []);

  const existingPlatforms = useMemo(
    () => new Set(links.map(l => l.platform.id)),
    [links]
  );

  const suggestionPills = useMemo(() => {
    const base = SUGGESTION_PILLS.filter(pill => {
      if (existingPlatforms.has(pill.id)) return false;
      if (pill.id === 'youtube-music' && existingPlatforms.has('youtube')) {
        return false;
      }
      return true;
    });
    const order = isMusicProfile ? MUSIC_FIRST_ORDER : SOCIAL_FIRST_ORDER;
    const rank = new Map<string, number>();
    order.forEach((id, index) => {
      rank.set(id, index);
    });

    return base
      .slice()
      .sort(
        (a, b) =>
          (rank.get(a.id) ?? Number.MAX_SAFE_INTEGER) -
          (rank.get(b.id) ?? Number.MAX_SAFE_INTEGER)
      );
  }, [existingPlatforms, isMusicProfile]);

  const hasAnyLinks = links.length > 0;

  const buildSecondaryText = useCallback(
    (link: Pick<DetectedLink, 'platform' | 'normalizedUrl'>) => {
      return suggestionIdentity(link);
    },
    []
  );

  return (
    <section
      className={cn('space-y-2', className)}
      aria-label='Links Manager'
      ref={containerRef}
    >
      <div>
        <div className='mx-auto w-full max-w-3xl space-y-3'>
          {/* Hint message with animation */}
          <AnimatePresence>
            {hint && (
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.2 }}
                className='rounded-lg border border-amber-300/40 bg-amber-50 text-amber-900 dark:bg-amber-950/30 dark:text-amber-200 px-3 py-2 text-sm'
                role='status'
                aria-live='polite'
              >
                {hint}
              </motion.div>
            )}
          </AnimatePresence>
          {ytPrompt && (
            <div className='rounded-lg border border-subtle bg-surface-1 p-3 text-sm flex items-center justify-between gap-3'>
              <div className='text-primary-token'>
                You already added{' '}
                {ytPrompt.candidate.platform.name ||
                  ytPrompt.candidate.platform.id}{' '}
                in this section. Do you also want to add it as{' '}
                {ytPrompt.target === 'dsp'
                  ? 'a music service'
                  : labelFor(ytPrompt.target)}
                ?
              </div>
              <div className='shrink-0 flex items-center gap-2'>
                <Button
                  size='sm'
                  variant='primary'
                  onClick={() => {
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
                  }}
                >
                  Add as {labelFor(ytPrompt.target)}
                </Button>
                <Button
                  size='sm'
                  variant='outline'
                  onClick={() => setYtPrompt(null)}
                >
                  Cancel
                </Button>
              </div>
            </div>
          )}
          {/* Combined search + add input */}
          <UniversalLinkInput
            onAdd={handleAdd}
            existingPlatforms={links
              .filter(l => l.platform.id !== 'youtube')
              .map(l => l.platform.id)}
            creatorName={creatorName}
            prefillUrl={prefillUrl}
            onPrefillConsumed={() => setPrefillUrl(undefined)}
            onQueryChange={() => {}}
            onPreviewChange={(link, isDuplicate) => {
              if (!link || isDuplicate) {
                setPendingPreview(null);
                return;
              }
              setPendingPreview({ link, isDuplicate });
            }}
            clearSignal={clearSignal}
          />

          {suggestionsEnabled && pendingSuggestions.length > 0 ? (
            <div
              className='rounded-2xl border border-subtle bg-surface-1/60 px-3 py-2.5 shadow-sm shadow-black/5'
              aria-label='Ingested link suggestions'
            >
              <div className='flex flex-wrap items-center justify-center gap-2'>
                {pendingSuggestions.map(suggestion => {
                  const identity =
                    buildSecondaryText(suggestion) ||
                    compactUrlDisplay(
                      suggestion.platform.id,
                      suggestion.normalizedUrl
                    );
                  const pillText = identity
                    ? `${suggestion.platform.name} • ${identity}`
                    : suggestion.platform.name;
                  return (
                    <PlatformPill
                      key={suggestionKey(suggestion)}
                      platformIcon={suggestion.platform.icon}
                      platformName={suggestion.platform.name}
                      primaryText={pillText}
                      badgeText='Suggested'
                      state='ready'
                      suffix={<Plus className='h-3.5 w-3.5' aria-hidden />}
                      trailing={
                        <button
                          type='button'
                          aria-label={`Dismiss ${suggestion.platform.name} suggestion`}
                          className='grid h-6 w-6 place-items-center rounded-full border border-subtle bg-surface-1 text-secondary-token transition hover:bg-surface-2 hover:text-primary-token'
                          onClick={event => {
                            event.stopPropagation();
                            void handleDismissSuggestionClick(suggestion);
                          }}
                        >
                          <X className='h-3.5 w-3.5' aria-hidden />
                        </button>
                      }
                      onClick={() => {
                        void handleAcceptSuggestionClick(suggestion);
                      }}
                      className='pr-1.5'
                      testId='ingested-suggestion-pill'
                    />
                  );
                })}
              </div>
            </div>
          ) : null}

          {suggestionPills.length > 0 ? (
            <div
              className='flex flex-wrap items-center justify-center gap-2'
              aria-label='Quick link suggestions'
            >
              {suggestionPills.map(pill => (
                <PlatformPill
                  key={pill.id}
                  platformIcon={pill.simpleIconId}
                  platformName={pill.label}
                  primaryText={pill.label}
                  suffix='+'
                  tone='faded'
                  onClick={() => setPrefillUrl(buildPrefillUrl(pill.id))}
                  className='whitespace-nowrap'
                />
              ))}
            </div>
          ) : null}
        </div>
      </div>

      <div className='mx-auto w-full max-w-3xl'>
        {!hasAnyLinks && (
          <div className='mt-3 rounded-lg border border-dashed border-subtle bg-surface-1/40 px-4 py-5 text-center animate-pulse'>
            <p className='text-sm font-medium text-primary-token'>
              Add links to build your profile.
            </p>
            <p className='mt-1 text-xs text-secondary-token'>
              Start with your most important link — music, socials, or a landing
              page.
            </p>
          </div>
        )}

        {hasAnyLinks && (
          <DndContext sensors={sensors} onDragEnd={onDragEnd} modifiers={[]}>
            <div className='grid gap-3 sm:grid-cols-2 lg:grid-cols-3'>
              {(['social', 'dsp', 'earnings', 'custom'] as const).map(
                section => {
                  const groupItems = groups[section];

                  const items = groupItems
                    .slice()
                    .sort(
                      (a, b) =>
                        popularityIndex(a.platform.id) -
                        popularityIndex(b.platform.id)
                    );

                  const isAddingToThis =
                    addingLink && sectionOf(addingLink) === section;
                  if (items.length === 0 && !isAddingToThis) {
                    return null;
                  }

                  return (
                    <CategorySection
                      key={section}
                      title={labelFor(section)}
                      variant='card'
                    >
                      <SortableContext items={items.map(idFor)}>
                        {items.map(link => {
                          const linkId = idFor(link as T);
                          return (
                            <SortableRow
                              key={linkId}
                              id={linkId}
                              link={link as T}
                              index={links.findIndex(
                                l => l.normalizedUrl === link.normalizedUrl
                              )}
                              draggable={items.length > 1}
                              onToggle={handleToggle}
                              onRemove={handleRemove}
                              onEdit={handleEdit}
                              visible={linkIsVisible(link as T)}
                              openMenuId={openMenuId}
                              onAnyMenuOpen={handleAnyMenuOpen}
                              isLastAdded={lastAddedId === linkId}
                              buildPillLabel={buildPillLabel}
                            />
                          );
                        })}

                        {pendingPreview &&
                        sectionOf(pendingPreview.link as T) === section ? (
                          <LinkPill
                            platformIcon={pendingPreview.link.platform.icon}
                            platformName={pendingPreview.link.platform.name}
                            primaryText={buildPillLabel(pendingPreview.link)}
                            secondaryText={buildSecondaryText(
                              pendingPreview.link
                            )}
                            state='ready'
                            badgeText='Ready to add'
                            menuId='pending-preview'
                            isMenuOpen={openMenuId === 'pending-preview'}
                            onMenuOpenChange={next =>
                              handleAnyMenuOpen(next ? 'pending-preview' : null)
                            }
                            menuItems={[
                              {
                                id: 'add',
                                label: 'Add',
                                iconName: 'Plus',
                                onSelect: () => {
                                  void handleAdd(pendingPreview.link);
                                  setPendingPreview(null);
                                  setClearSignal(c => c + 1);
                                },
                              },
                              {
                                id: 'cancel',
                                label: 'Cancel',
                                iconName: 'X',
                                onSelect: () => {
                                  setPendingPreview(null);
                                  setClearSignal(c => c + 1);
                                },
                              },
                            ]}
                          />
                        ) : null}

                        {isAddingToThis && (
                          <LinkPill
                            platformIcon='website'
                            platformName='Loading'
                            primaryText='Adding…'
                            state='loading'
                            menuId={`loading-${section}`}
                            isMenuOpen={false}
                            onMenuOpenChange={() => {}}
                            menuItems={[]}
                          />
                        )}
                      </SortableContext>
                    </CategorySection>
                  );
                }
              )}
            </div>
          </DndContext>
        )}
      </div>
    </section>
  );
}

function buildPrefillUrl(platformId: string): string {
  switch (platformId) {
    case 'spotify-artist':
      // Special case: triggers search mode in UniversalLinkInput
      return '__SEARCH_MODE__:spotify';
    case 'spotify':
      return 'https://open.spotify.com/artist/';
    case 'apple-music':
      return 'https://music.apple.com/artist/';
    case 'youtube-music':
      return 'https://music.youtube.com/channel/';
    case 'instagram':
      return 'https://instagram.com/';
    case 'tiktok':
      return 'https://www.tiktok.com/@';
    case 'youtube':
      return 'https://www.youtube.com/@';
    case 'twitter':
      return 'https://x.com/';
    case 'venmo':
      return 'https://venmo.com/';
    case 'website':
      return 'https://';
    default:
      return '';
  }
}

interface SortableRowProps<T extends DetectedLink> {
  id: string;
  link: T;
  index: number;
  onToggle: (idx: number) => void;
  onRemove: (idx: number) => void;
  onEdit: (idx: number) => void;
  visible: boolean;
  draggable?: boolean;
  openMenuId: string | null;
  onAnyMenuOpen: (id: string | null) => void;
  isLastAdded: boolean;
  buildPillLabel: (link: DetectedLink) => string;
}

/**
 * SortableRow - Memoized row component for drag-and-drop link items.
 * Uses shared color utilities for consistent brand theming.
 */
const SortableRow = React.memo(function SortableRow<T extends DetectedLink>({
  id,
  link,
  index,
  onToggle,
  onRemove,
  onEdit,
  visible,
  draggable = true,
  openMenuId,
  onAnyMenuOpen,
  isLastAdded,
  buildPillLabel,
}: SortableRowProps<T>) {
  const { attributes, listeners, setNodeRef, transform, transition } =
    useSortable({
      id,
      disabled: !draggable,
    });

  // Reserved for future drag handle pointer down handler
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const _handleDragHandlePointerDown = React.useCallback(
    (e: React.PointerEvent<HTMLButtonElement>) => {
      if (listeners?.onPointerDown) {
        listeners.onPointerDown(e);
      }
    },
    [listeners]
  );

  const cardStyle: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const urlDisplay = compactUrlDisplay(link.platform.id, link.normalizedUrl);
  const identity = canonicalIdentity(link);
  const secondaryText = identity.startsWith('@') ? identity : undefined;

  const pillState: LinkPillState = !visible
    ? 'hidden'
    : link.isValid === false
      ? 'error'
      : 'connected';

  const badgeText = !visible
    ? 'Hidden'
    : pillState === 'error'
      ? 'Needs fix'
      : isLastAdded
        ? 'New'
        : undefined;

  const menuItems: LinkPillMenuItem[] = [
    {
      id: 'edit',
      label: 'Edit',
      iconName: 'Pencil',
      onSelect: () => onEdit(index),
    },
    {
      id: 'toggle',
      label: visible ? 'Hide' : 'Show',
      iconName: visible ? 'EyeOff' : 'Eye',
      onSelect: () => onToggle(index),
    },
    {
      id: 'delete',
      label: 'Delete',
      iconName: 'Trash',
      variant: 'destructive',
      onSelect: () => onRemove(index),
    },
  ];

  return (
    <div
      ref={setNodeRef}
      {...attributes}
      className={cn('relative')}
      style={cardStyle}
      {...listeners}
    >
      <LinkPill
        platformIcon={link.platform.icon}
        platformName={link.platform.name || link.platform.id}
        primaryText={buildPillLabel(link)}
        secondaryText={secondaryText}
        state={pillState}
        badgeText={badgeText}
        shimmerOnMount={isLastAdded}
        menuItems={menuItems}
        menuId={id}
        isMenuOpen={openMenuId === id}
        onMenuOpenChange={next => onAnyMenuOpen(next ? id : null)}
        className='max-w-full'
      />

      <div className='sr-only'>{urlDisplay}</div>
    </div>
  );
});

function groupLinks<T extends DetectedLink = DetectedLink>(
  links: T[]
): Record<LinkSection, T[]> {
  // Preserve incoming order; categories are only for grouping/drag between types.
  const social: T[] = [];
  const dsp: T[] = [];
  const earnings: T[] = [];
  const custom: T[] = [];

  for (const l of links) {
    // Category comes from platform metadata; fallback to custom
    const category = (l.platform.category ?? 'custom') as
      | 'social'
      | 'dsp'
      | 'websites'
      | 'earnings'
      | 'custom';
    if (category === 'social') social.push(l);
    else if (category === 'dsp') dsp.push(l);
    else if (category === 'earnings') earnings.push(l);
    else custom.push(l);
  }

  return {
    social,
    dsp,
    earnings,
    custom,
  };
}

function labelFor(section: LinkSection): string {
  switch (section) {
    case 'social':
      return 'SOCIAL';
    case 'dsp':
      return 'MUSIC SERVICE';
    case 'earnings':
      return 'MONETIZATION';
    default:
      return 'CUSTOM';
  }
}

function compactUrlDisplay(platformId: string, url: string): string {
  const trimmed = url.trim();
  if (!trimmed) return '';

  const withScheme = (() => {
    if (/^https?:\/\//i.test(trimmed)) return trimmed;
    return `https://${trimmed}`;
  })();

  try {
    const parsed = new URL(withScheme);
    const host = parsed.hostname.replace(/^www\./, '');
    const path = parsed.pathname.replace(/\/+$/, '');
    const segments = path.split('/').filter(Boolean);
    const first = segments[0] ?? '';
    const second = segments[1] ?? '';

    const atOr = (value: string): string =>
      value.startsWith('@') ? value : `@${value}`;

    if (platformId === 'tiktok') {
      if (!first) return host;
      return first.startsWith('@') ? first : atOr(first);
    }

    if (
      platformId === 'instagram' ||
      platformId === 'twitter' ||
      platformId === 'x' ||
      platformId === 'venmo'
    ) {
      if (!first) return host;
      return first.startsWith('@') ? first : atOr(first);
    }

    if (platformId === 'snapchat') {
      if (!first) return host;
      if (first === 'add' && second) return atOr(second);
      return first.startsWith('@') ? first : atOr(first);
    }

    if (platformId === 'youtube') {
      if (first.startsWith('@')) return first;
      if (
        (first === 'channel' || first === 'c' || first === 'user') &&
        second
      ) {
        return atOr(second);
      }
      return first ? first : host;
    }

    if (platformId === 'website') {
      return host;
    }

    return host;
  } catch {
    const withoutScheme = trimmed.replace(/^https?:\/\//, '');
    const beforePath = withoutScheme.split('/')[0];
    return beforePath || trimmed;
  }
}

function suggestionIdentity(
  link: Pick<DetectedLink, 'platform' | 'normalizedUrl'>
): string | undefined {
  const identity = canonicalIdentity(link);
  return identity.startsWith('@') ? identity : undefined;
}
