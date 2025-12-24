'use client';
import { DndContext } from '@dnd-kit/core';
import { SortableContext, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { LinkIcon } from '@heroicons/react/24/outline';
import { Button } from '@jovie/ui';
import { AnimatePresence, motion } from 'framer-motion';
import { Plus, X } from 'lucide-react';
import React, { useCallback, useMemo, useRef, useState } from 'react';
import { PlatformPill } from '@/components/dashboard/atoms/PlatformPill';
import {
  UniversalLinkInput,
  type UniversalLinkInputRef,
} from '@/components/dashboard/molecules/UniversalLinkInput';
import { popularityIndex } from '@/constants/app';
import { cn } from '@/lib/utils';
// getBrandIconStyles reserved for future brand-colored icons
import '@/lib/utils/color';
import { EmptyState } from '@/components/ui/EmptyState';
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
import {
  MUSIC_FIRST_ORDER,
  SOCIAL_FIRST_ORDER,
  SUGGESTION_PILLS,
} from './links/config';
import {
  type SuggestedLink,
  useDragAndDrop,
  useLinksManager,
  useSuggestions,
} from './links/hooks';
import {
  buildPrefillUrl,
  compactUrlDisplay,
  groupLinks,
  type LinkSection,
  labelFor,
  sectionOf,
  suggestionIdentity,
} from './links/utils';

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
  profileId?: string;
}

// Client Component scaffold for a single, grouped Links Manager
// Phase 2: wire minimal callbacks for DashboardLinks integration.
// Note: CROSS_CATEGORY, SUGGESTION_PILLS, MUSIC_FIRST_ORDER, SOCIAL_FIRST_ORDER
// are now imported from ./links/config and ./links/utils
// buildSuggestionEventProperties is now in useSuggestions hook

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
  profileId,
}: GroupedLinksManagerProps<T>) {
  // ─────────────────────────────────────────────────────────────────────────────
  // Custom hooks for state management
  // ─────────────────────────────────────────────────────────────────────────────

  // Link state management (CRUD operations, YouTube prompts, etc.)
  const {
    links,
    setLinks,
    handleAdd,
    handleToggle,
    handleRemove,
    handleEdit,
    insertLinkWithSectionOrdering,
    ytPrompt,
    confirmYtPrompt,
    cancelYtPrompt,
    lastAddedId,
    addingLink,
    prefillUrl,
    setPrefillUrl,
    clearPrefillUrl,
    idFor,
    linkIsVisible,
  } = useLinksManager<T>({
    initialLinks,
    onLinksChange,
    onLinkAdded,
  });

  // Suggestion state management (pending suggestions, accept/dismiss with analytics)
  const {
    pendingSuggestions,
    handleAccept: handleAcceptSuggestionFromHook,
    handleDismiss: handleDismissSuggestionFromHook,
    suggestionKey,
    hasPendingSuggestions,
  } = useSuggestions<SuggestedLink>({
    suggestedLinks: suggestedLinks as SuggestedLink[],
    suggestionsEnabled,
    profileId,
    onAcceptSuggestion: onAcceptSuggestion as (
      suggestion: SuggestedLink
    ) => Promise<DetectedLink | null> | DetectedLink | null | void,
    onDismissSuggestion: onDismissSuggestion as (
      suggestion: SuggestedLink
    ) => Promise<void> | void,
  });

  // Drag-and-drop functionality (sensors, handlers, hint messages)
  const { sensors, onDragEnd, hint } = useDragAndDrop<T>({
    links,
    onLinksChange: next => {
      setLinks(next);
      onLinksChange?.(next);
    },
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // Local UI state
  // ─────────────────────────────────────────────────────────────────────────────

  // Ensure only one action menu is open at a time
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const handleAnyMenuOpen = useCallback((id: string | null) => {
    setOpenMenuId(id);
  }, []);

  const containerRef = useRef<HTMLDivElement | null>(null);
  const linkInputRef = useRef<UniversalLinkInputRef | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- reserved for future collapse animation
  const [_collapsedInitialized, _setCollapsedInitialized] = useState(false);
  const [pendingPreview, setPendingPreview] = useState<{
    link: DetectedLink;
    isDuplicate: boolean;
  } | null>(null);
  const [clearSignal, setClearSignal] = useState(0);

  // ─────────────────────────────────────────────────────────────────────────────
  // Derived state and memoized values
  // ─────────────────────────────────────────────────────────────────────────────

  const groups = useMemo(() => groupLinks(links), [links]);

  // Memoize sorted groups to avoid O(n log n) sort on every render
  const sortedGroups = useMemo(() => {
    const sorted: Record<LinkSection, T[]> = {
      social: [],
      dsp: [],
      earnings: [],
      custom: [],
    };

    (['social', 'dsp', 'earnings', 'custom'] as const).forEach(section => {
      sorted[section] = groups[section]
        .slice()
        .sort(
          (a, b) =>
            popularityIndex(a.platform.id) - popularityIndex(b.platform.id)
        );
    });

    return sorted;
  }, [groups]);

  // ─────────────────────────────────────────────────────────────────────────────
  // Suggestion handlers (bridge between useSuggestions and link insertion)
  // ─────────────────────────────────────────────────────────────────────────────

  const handleAcceptSuggestionClick = useCallback(
    async (suggestion: SuggestedLink) => {
      const accepted = await handleAcceptSuggestionFromHook(suggestion);
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
        }
        onLinkAdded?.([nextLink]);
      }
    },
    [
      handleAcceptSuggestionFromHook,
      links,
      setLinks,
      insertLinkWithSectionOrdering,
      onLinkAdded,
    ]
  );

  const handleDismissSuggestionClick = useCallback(
    async (suggestion: SuggestedLink) => {
      await handleDismissSuggestionFromHook(suggestion);
    },
    [handleDismissSuggestionFromHook]
  );

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

  const focusLinkInput = useCallback(() => {
    const input = linkInputRef.current?.getInputElement();
    if (input) {
      input.focus();
      input.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }
    containerRef.current?.scrollIntoView({
      behavior: 'smooth',
      block: 'start',
    });
  }, []);

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
      data-testid='grouped-links-manager'
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
                <Button size='sm' variant='primary' onClick={confirmYtPrompt}>
                  Add as {labelFor(ytPrompt.target)}
                </Button>
                <Button size='sm' variant='outline' onClick={cancelYtPrompt}>
                  Cancel
                </Button>
              </div>
            </div>
          )}
          {/* Combined search + add input */}
          <UniversalLinkInput
            ref={linkInputRef}
            onAdd={handleAdd}
            existingPlatforms={links
              .filter(l => l.platform.id !== 'youtube')
              .map(l => l.platform.id)}
            creatorName={creatorName}
            prefillUrl={prefillUrl}
            onPrefillConsumed={clearPrefillUrl}
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

          {hasPendingSuggestions ? (
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
          <EmptyState
            icon={<LinkIcon className='h-6 w-6' aria-hidden='true' />}
            heading='Add your first link'
            description='Start with your most important link — music, socials, or a landing page.'
            action={{
              label: 'Add link',
              onClick: focusLinkInput,
            }}
            secondaryAction={{
              label: 'Learn about links',
              href: '/support',
            }}
            className='mt-3 w-full rounded-2xl border border-dashed border-subtle bg-surface-1/40'
          />
        )}

        {hasAnyLinks && (
          <DndContext sensors={sensors} onDragEnd={onDragEnd} modifiers={[]}>
            <div className='grid gap-3 sm:grid-cols-2 lg:grid-cols-3'>
              {(['social', 'dsp', 'earnings', 'custom'] as const).map(
                section => {
                  const items = sortedGroups[section];

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

// Note: buildPrefillUrl is now imported from ./links/utils

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

// Note: groupLinks, labelFor, compactUrlDisplay, and suggestionIdentity
// are now imported from ./links/utils
