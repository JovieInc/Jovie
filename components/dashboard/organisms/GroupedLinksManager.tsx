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
import { Button, Tooltip, TooltipContent, TooltipTrigger } from '@jovie/ui';
import { AnimatePresence, motion } from 'framer-motion';
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { getPlatformIcon, SocialIcon } from '@/components/atoms/SocialIcon';
import { UniversalLinkInput } from '@/components/dashboard/molecules/UniversalLinkInput';
import { MAX_SOCIAL_LINKS, popularityIndex } from '@/constants/app';
import { cn } from '@/lib/utils';
import { getBrandIconStyles } from '@/lib/utils/color';
import {
  canonicalIdentity,
  type DetectedLink,
} from '@/lib/utils/platform-detection';
import { LinkActions } from '../atoms/LinkActions';

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
  Array<'social' | 'dsp' | 'custom'>
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
  'spotify',
  'apple-music',
  'youtube-music',
  'instagram',
  'tiktok',
  'youtube',
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
  const [collapsed, setCollapsed] = useState<
    Record<'social' | 'dsp' | 'earnings' | 'custom', boolean>
  >({ social: false, dsp: false, earnings: false, custom: false });

  const containerRef = useRef<HTMLDivElement>(null);
  const [collapsedInitialized, setCollapsedInitialized] = useState(false);
  const [tippingEnabled, setTippingEnabled] = useState<boolean>(false);
  const [tippingJustEnabled, setTippingJustEnabled] = useState<boolean>(false);
  const [ytPrompt, setYtPrompt] = useState<{
    candidate: DetectedLink;
    target: 'social' | 'dsp';
  } | null>(null);
  const [hint, setHint] = useState<string | null>(null);

  const [searchQuery, setSearchQuery] = useState('');
  const [prefillUrl, setPrefillUrl] = useState<string | undefined>();
  const [pendingSuggestions, setPendingSuggestions] = useState(suggestedLinks);

  useEffect(() => {
    setPendingSuggestions(suggestedLinks);
  }, [suggestedLinks]);

  const matchesSearch = useCallback(
    (l: T): boolean => {
      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase();
      const suggestedTitle = (
        (l as unknown as { suggestedTitle?: string }).suggestedTitle ||
        (l.platform.name ?? '')
      ).toLowerCase();
      const url = (
        (l as unknown as { normalizedUrl?: string }).normalizedUrl ||
        (l as unknown as { originalUrl?: string }).originalUrl ||
        ''
      ).toLowerCase();
      const platformId = (l.platform.id ?? '').toLowerCase();

      return (
        suggestedTitle.includes(q) || url.includes(q) || platformId.includes(q)
      );
    },
    [searchQuery]
  );

  const groups = useMemo(() => groupLinks(links), [links]);

  const linkIsVisible = (l: T): boolean =>
    ((l as unknown as { isVisible?: boolean }).isVisible ?? true) !== false;

  useEffect(() => {
    if (!collapsedInitialized) {
      const initialCollapsed = {
        social: groups.social.length === 0,
        dsp: groups.dsp.length === 0,
        earnings: groups.earnings.length === 0,
        custom: groups.custom.length === 0,
      };

      const timer = setTimeout(() => {
        setCollapsed(initialCollapsed);
        setCollapsedInitialized(true);
      }, 50);

      return () => clearTimeout(timer);
    } else {
      setCollapsed(prev => {
        const next = { ...prev };

        if (groups.social.length === 0 && !prev.social) {
          next.social = true;
        }
        if (groups.dsp.length === 0 && !prev.dsp) {
          next.dsp = true;
        }
        if (groups.earnings.length === 0 && !prev.earnings) {
          next.earnings = true;
        }
        if (groups.custom.length === 0 && !prev.custom) {
          next.custom = true;
        }

        // Avoid triggering a render loop when nothing actually changed
        if (
          next.social === prev.social &&
          next.dsp === prev.dsp &&
          next.earnings === prev.earnings &&
          next.custom === prev.custom
        ) {
          return prev;
        }

        return next;
      });
    }

    const enabled = groups.earnings.length > 0;
    if (enabled && !tippingEnabled) {
      setTippingJustEnabled(true);
      window.setTimeout(() => setTippingJustEnabled(false), 1500);
    }
    setTippingEnabled(enabled);
  }, [groups, collapsedInitialized, tippingEnabled]);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 5 },
    })
  );

  const idFor = (l: T) => `${l.platform.id}::${l.normalizedUrl}`;
  const mapIdToIndex = useMemo(() => {
    const m = new Map<string, number>();
    links.forEach((l, i) => m.set(`${l.platform.id}::${l.normalizedUrl}`, i));
    return m;
  }, [links]);

  const sectionOf = (l: T) =>
    (l.platform.category ?? 'custom') as
      | 'social'
      | 'dsp'
      | 'earnings'
      | 'custom';

  const canMoveTo = (
    l: T,
    target: 'social' | 'dsp' | 'custom' | 'earnings'
  ): boolean => {
    if (target === 'earnings') return false;
    const allowed =
      CROSS_CATEGORY[l.platform.id as keyof typeof CROSS_CATEGORY];
    if (!allowed) return false;
    return allowed.includes(target as 'social' | 'dsp' | 'custom');
  };

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

    const next = [...links, enriched];
    setLinks(next);
    onLinkAdded?.([enriched as T]);

    setCollapsed(prev => ({ ...prev, [section]: false }));

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

  async function handleAcceptSuggestionClick(
    suggestion: (typeof pendingSuggestions)[number]
  ) {
    if (!onAcceptSuggestion) return;
    const accepted = await onAcceptSuggestion(suggestion);
    setPendingSuggestions(prev =>
      prev.filter(s => suggestionKey(s) !== suggestionKey(suggestion))
    );
    if (accepted) {
      const nextLink = {
        ...(accepted as T),
        isVisible:
          (accepted as unknown as { isVisible?: boolean }).isVisible ?? true,
        state: (accepted as unknown as { state?: string }).state ?? 'active',
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
        setLinks(prev => [...prev, nextLink]);
      }
      onLinkAdded?.([nextLink]);
    }
  }

  async function handleDismissSuggestionClick(
    suggestion: (typeof pendingSuggestions)[number]
  ) {
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
    const updated = {
      ...from,
      platform: { ...from.platform, category: toSection },
    } as T;
    next.splice(fromIdx, 1);
    next.splice(toIdx, 0, updated);
    setLinks(next);
    onLinksChange?.(next);
    setCollapsed(prev => ({ ...prev, [toSection]: false }));
  }

  const existingPlatforms = useMemo(
    () => new Set(links.map(l => l.platform.id)),
    [links]
  );

  const suggestionPills = useMemo(() => {
    const base = SUGGESTION_PILLS.filter(
      pill => !existingPlatforms.has(pill.id)
    );
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
  const filteredCount = links.filter(matchesSearch).length;

  const COMPLETION_TARGET = 6;
  const completionPercent = hasAnyLinks
    ? Math.min(
        100,
        Math.round(
          (Math.min(links.length, COMPLETION_TARGET) / COMPLETION_TARGET) * 100
        )
      )
    : 0;

  return (
    <section
      className={cn('space-y-4', className)}
      aria-label='Links Manager'
      ref={containerRef}
    >
      {/* Hint message with animation */}
      <AnimatePresence>
        {hint && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.2 }}
            className='mb-4 rounded-lg border border-amber-300/40 bg-amber-50 text-amber-900 dark:bg-amber-950/30 dark:text-amber-200 px-3 py-2 text-sm'
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
            {ytPrompt.candidate.platform.name || ytPrompt.candidate.platform.id}{' '}
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
        socialVisibleCount={
          links.filter(
            l => l.platform.category === 'social' && linkIsVisible(l)
          ).length
        }
        socialVisibleLimit={MAX_SOCIAL_LINKS}
        creatorName={creatorName}
        prefillUrl={prefillUrl}
        onPrefillConsumed={() => setPrefillUrl(undefined)}
        onQueryChange={setSearchQuery}
      />

      {/* Links summary + completion indicator */}
      <div className='mt-2 space-y-1 text-xs text-secondary-token'>
        <div className='flex items-center justify-between'>
          <span>
            {filteredCount} {filteredCount === 1 ? 'link' : 'links'} found
          </span>
        </div>
        {hasAnyLinks && !searchQuery.trim() && (
          <div className='mt-1 flex flex-col gap-1'>
            <div className='flex items-center justify-between'>
              <span>{`You're ${completionPercent}% done`}</span>
              <span>Most creators add 4–6 links.</span>
            </div>
            <div
              className='h-1.5 w-full rounded-full bg-surface-2 overflow-hidden'
              aria-hidden='true'
            >
              <div
                className='h-full rounded-full bg-accent transition-all'
                style={{ width: `${completionPercent}%` }}
              />
            </div>
          </div>
        )}
      </div>

      {suggestionsEnabled && pendingSuggestions.length > 0 && (
        <div className='mt-3 rounded-lg border border-subtle bg-surface-1 p-3 space-y-3'>
          <div className='flex items-center justify-between'>
            <div className='text-sm font-semibold text-primary-token'>
              Suggested links
            </div>
            <span className='text-xs text-secondary-token'>
              {pendingSuggestions.length} pending
            </span>
          </div>
          <div className='grid gap-3 sm:grid-cols-2'>
            {pendingSuggestions.map(suggestion => {
              const iconMeta = getPlatformIcon(suggestion.platform.icon);
              const brandHex = iconMeta?.hex ? `#${iconMeta.hex}` : '#6b7280';
              const rawConfidence = (suggestion as { confidence?: number })
                .confidence;
              const confidence: number | null =
                typeof rawConfidence === 'number' ? rawConfidence : null;
              return (
                <div
                  key={suggestionKey(suggestion)}
                  className='rounded-lg border border-subtle bg-surface-2 p-3 flex flex-col gap-2'
                >
                  <div className='flex items-start gap-2'>
                    <span
                      className='flex h-8 w-8 items-center justify-center rounded-md'
                      style={{
                        backgroundColor: `${brandHex}22`,
                        color: brandHex,
                      }}
                    >
                      <SocialIcon
                        platform={suggestion.platform.icon}
                        className='h-4 w-4'
                      />
                    </span>
                    <div className='min-w-0 flex-1'>
                      <div className='text-sm font-medium text-primary-token truncate'>
                        {suggestion.suggestedTitle}
                      </div>
                      <div className='text-xs text-tertiary-token truncate'>
                        {suggestion.normalizedUrl}
                      </div>
                      {typeof confidence === 'number' && (
                        <div className='mt-1 inline-flex items-center gap-1 rounded-full bg-surface-1 px-2 py-0.5 text-[11px] text-secondary-token ring-1 ring-subtle'>
                          Confidence {Math.round(confidence * 100)}%
                        </div>
                      )}
                    </div>
                  </div>
                  <div className='flex items-center gap-2'>
                    <Button
                      size='sm'
                      className='flex-1'
                      onClick={() =>
                        void handleAcceptSuggestionClick(suggestion)
                      }
                    >
                      Add
                    </Button>
                    <Button
                      size='sm'
                      variant='ghost'
                      onClick={() =>
                        void handleDismissSuggestionClick(suggestion)
                      }
                    >
                      Dismiss
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {suggestionPills.length > 0 && !searchQuery.trim() && (
        <div className='mt-3 relative' aria-label='Quick link suggestions'>
          <div
            className='flex gap-2 overflow-x-auto overflow-y-hidden pr-4 pb-1 [&::-webkit-scrollbar]:hidden'
            style={{
              WebkitOverflowScrolling: 'touch',
              scrollbarWidth: 'none',
              msOverflowStyle: 'none',
              WebkitMaskImage:
                'linear-gradient(to right, #000 0%, #000 80%, transparent 100%)',
              maskImage:
                'linear-gradient(to right, #000 0%, #000 80%, transparent 100%)',
            }}
          >
            {suggestionPills.map(pill => {
              const iconMeta = getPlatformIcon(pill.simpleIconId);
              const brandHex = iconMeta?.hex ? `#${iconMeta.hex}` : '#6b7280';
              // Detect dark colors (like TikTok #000, X #000) and use a lighter fallback
              const isDarkColor = (() => {
                const hex = brandHex.replace('#', '');
                const r = parseInt(hex.slice(0, 2), 16);
                const g = parseInt(hex.slice(2, 4), 16);
                const b = parseInt(hex.slice(4, 6), 16);
                // Luminance threshold - colors below this are too dark
                const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
                return luminance < 0.25;
              })();
              const iconColor = isDarkColor ? '#9ca3af' : brandHex; // gray-400 fallback
              const borderColor = isDarkColor ? '#6b728066' : `${brandHex}66`;
              return (
                <button
                  key={pill.id}
                  type='button'
                  onClick={() => setPrefillUrl(buildPrefillUrl(pill.id))}
                  className='inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium text-tertiary-token bg-surface-1/60 opacity-50 transition-all hover:opacity-100 hover:text-secondary-token hover:bg-surface-2/60 focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-0'
                  style={{ borderColor }}
                >
                  <span
                    className='flex items-center justify-center rounded-full bg-surface-2/60 p-0.5 transition-colors'
                    style={{ color: iconColor }}
                  >
                    <SocialIcon
                      platform={pill.simpleIconId}
                      className='h-3.5 w-3.5'
                    />
                  </span>
                  <span>{pill.label}</span>
                  <span className='ml-0.5 text-[10px]'>+</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {!hasAnyLinks && !searchQuery.trim() && (
        <div className='mt-4 rounded-lg border border-dashed border-subtle bg-surface-1/40 px-4 py-6 text-center animate-pulse'>
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
        <DndContext sensors={sensors} onDragEnd={onDragEnd}>
          {(['social', 'dsp', 'earnings', 'custom'] as const).map(section => {
            const groupItems = groups[section];
            if (groupItems.length === 0) {
              return null;
            }

            const items = groupItems
              .filter(matchesSearch)
              .sort(
                (a, b) =>
                  popularityIndex(a.platform.id) -
                  popularityIndex(b.platform.id)
              );

            // Hide section when search/filter yields no results
            if (items.length === 0) {
              return null;
            }

            return (
              <div key={section} className='space-y-3'>
                <header className='flex items-center justify-between'>
                  <button
                    type='button'
                    className='flex items-center gap-2 text-sm font-semibold capitalize text-primary-token'
                    onClick={() =>
                      setCollapsed(prev => ({
                        ...prev,
                        [section]: !prev[section],
                      }))
                    }
                    aria-expanded={!collapsed[section]}
                    aria-controls={`links-section-${section}`}
                  >
                    <svg
                      className={cn(
                        'h-4 w-4 transition-transform',
                        collapsed[section] ? '-rotate-90' : 'rotate-0'
                      )}
                      viewBox='0 0 20 20'
                      aria-hidden='true'
                    >
                      <path
                        d='M6 8l4 4 4-4'
                        stroke='currentColor'
                        strokeWidth='2'
                        fill='none'
                        strokeLinecap='round'
                        strokeLinejoin='round'
                      />
                    </svg>
                    {labelFor(section)}
                    <span className='ml-2 inline-flex items-center rounded-full bg-surface-2 text-secondary-token px-1.5 py-0.5 text-[10px] font-medium ring-1 ring-subtle'>
                      {items.length}
                    </span>
                    {section === 'earnings' && tippingEnabled && (
                      <span
                        className={cn(
                          'ml-2 inline-flex items-center rounded-full bg-green-500/15 text-green-600 dark:text-green-400 px-2 py-0.5 text-[10px] font-medium ring-1 ring-green-500/25',
                          tippingJustEnabled && 'animate-pulse'
                        )}
                      >
                        Tipping enabled
                      </span>
                    )}
                  </button>
                  <div className='flex items-center gap-2'>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span className='inline-flex h-5 w-5 items-center justify-center rounded-md text-tertiary hover:text-secondary ring-1 ring-transparent hover:ring-subtle cursor-help'>
                          <svg
                            viewBox='0 0 20 20'
                            className='h-3.5 w-3.5'
                            aria-hidden='true'
                          >
                            <path
                              d='M10 18a8 8 0 1 1 0-16 8 8 0 0 1 0 16Zm-.75-4.5h1.5v-1.2c0-.62.32-.96 1.02-1.3.94-.45 1.48-1.13 1.48-2.13 0-1.7-1.38-2.87-3.25-2.87-1.7 0-3 .9-3.33 2.35l1.45.38c.17-.74.82-1.2 1.83-1.2 1 0 1.7.56 1.7 1.34 0 .58-.25.89-.97 1.23-.98.46-1.43 1.07-1.43 2.1v1.5Zm0 2.25h1.5v-1.5h-1.5v1.5Z'
                              fill='currentColor'
                            />
                          </svg>
                        </span>
                      </TooltipTrigger>
                      <TooltipContent side='top'>
                        Links are ordered automatically based on popularity.
                        Some links (like YouTube) can appear in both Music &
                        Social.
                      </TooltipContent>
                    </Tooltip>
                  </div>
                </header>
                <SortableContext items={items.map(idFor)}>
                  <ul
                    id={`links-section-${section}`}
                    className={cn(
                      'divide-y divide-subtle dark:divide-white/10 rounded-lg border border-subtle dark:border-white/10 bg-surface-1',
                      collapsed[section] && 'hidden'
                    )}
                  >
                    {items.map(link => (
                      <SortableRow
                        key={idFor(link as T)}
                        id={idFor(link as T)}
                        link={link as T}
                        index={links.findIndex(
                          l => l.normalizedUrl === link.normalizedUrl
                        )}
                        draggable={section !== 'earnings'}
                        onToggle={handleToggle}
                        onRemove={handleRemove}
                        visible={linkIsVisible(link as T)}
                      />
                    ))}
                    {items.length === 0 && (
                      <li className='p-3 text-sm text-tertiary italic'>
                        No {labelFor(section)} links match your search
                      </li>
                    )}
                  </ul>
                </SortableContext>
              </div>
            );
          })}
        </DndContext>
      )}
    </section>
  );
}

function buildPrefillUrl(platformId: string): string {
  switch (platformId) {
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
  visible: boolean;
  draggable?: boolean;
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
  visible,
  draggable = true,
}: SortableRowProps<T>) {
  const { attributes, listeners, setNodeRef, transform, transition } =
    useSortable({
      id,
      disabled: !draggable,
    });

  // Create a properly typed pointer down handler for the drag handle
  const handleDragHandlePointerDown = React.useCallback(
    (e: React.PointerEvent<HTMLButtonElement>) => {
      if (listeners?.onPointerDown) {
        listeners.onPointerDown(e);
      }
    },
    [listeners]
  );

  // Track dark theme for icon color inversion
  const [isDarkTheme, setIsDarkTheme] = React.useState(false);
  React.useEffect(() => {
    const root = document.documentElement;
    const update = () => setIsDarkTheme(root.classList.contains('dark'));
    update();
    const mo = new MutationObserver(update);
    mo.observe(root, { attributes: true, attributeFilter: ['class'] });
    return () => mo.disconnect();
  }, []);

  // Use shared color utilities for brand icon styling
  const iconMeta = getPlatformIcon(link.platform.icon);
  const brandHex = iconMeta?.hex ? `#${iconMeta.hex}` : '#6b7280';
  const { iconColor, iconBg } = getBrandIconStyles(brandHex, isDarkTheme);

  return (
    <li
      ref={setNodeRef}
      className='group relative p-3 text-sm text-secondary-token flex items-center justify-between gap-3 hover:bg-surface-2/50 rounded-lg transition-colors'
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
      }}
      {...attributes}
    >
      <div className='min-w-0 flex items-start gap-3 flex-1'>
        <div
          className='flex items-center justify-center w-7 h-7 rounded-lg shrink-0 mt-0.5 transition-all group-hover:scale-[1.04] group-hover:ring-1 group-hover:ring-subtle'
          style={{ backgroundColor: iconBg, color: iconColor }}
          aria-hidden='true'
        >
          <SocialIcon platform={link.platform.icon} className='w-4 h-4' />
        </div>
        <div className='min-w-0 flex-1'>
          <div className='text-primary-token font-medium truncate'>
            {link.suggestedTitle}
          </div>
          <div className='text-xs text-tertiary-token/80 truncate'>
            {link.normalizedUrl}
          </div>
        </div>
      </div>

      <div className='flex items-center gap-1'>
        <LinkActions
          onToggle={() => onToggle(index)}
          onRemove={() => onRemove(index)}
          isVisible={visible}
          showDragHandle={draggable}
          onDragHandlePointerDown={handleDragHandlePointerDown}
        />
      </div>
    </li>
  );
});

function groupLinks<T extends DetectedLink = DetectedLink>(
  links: T[]
): Record<'social' | 'dsp' | 'earnings' | 'custom', T[]> {
  const social: T[] = [];
  const dsp: T[] = [];
  const earnings: T[] = [];
  const custom: T[] = [];

  for (const l of links) {
    // Category comes from platform metadata; fallback to custom
    const category = (l.platform.category ?? 'custom') as
      | 'social'
      | 'dsp'
      | 'earnings'
      | 'custom';
    if (category === 'social') social.push(l);
    else if (category === 'dsp') dsp.push(l);
    else if (category === 'earnings') earnings.push(l);
    else custom.push(l);
  }

  const byStable = (a: T, b: T) =>
    (a.normalizedUrl || '').localeCompare(b.normalizedUrl || '');

  return {
    social: social.sort(byStable),
    dsp: dsp.sort(byStable),
    earnings: earnings.sort(byStable),
    custom: custom.sort(byStable),
  };
}

function labelFor(section: 'social' | 'dsp' | 'earnings' | 'custom'): string {
  switch (section) {
    case 'social':
      return 'Social';
    case 'dsp':
      return 'Music Service';
    case 'earnings':
      return 'Earnings';
    default:
      return 'Custom';
  }
}
