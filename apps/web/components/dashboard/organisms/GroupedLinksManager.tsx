'use client';
import { LinkIcon } from '@heroicons/react/24/outline';
import { AnimatePresence, motion } from 'framer-motion';
import { useCallback, useMemo, useRef, useState } from 'react';
import {
  UniversalLinkInput,
  type UniversalLinkInputRef,
} from '@/components/dashboard/molecules/UniversalLinkInput';
import { cn } from '@/lib/utils';
// getBrandIconStyles reserved for future brand-colored icons
import '@/lib/utils/color';
import { EmptyState } from '@/components/ui/EmptyState';
import {
  canonicalIdentity,
  type DetectedLink,
} from '@/lib/utils/platform-detection';
import {
  type SuggestedLink,
  useLinksManager,
  useSuggestions,
} from './links/hooks';
import { IngestedSuggestions } from './links/IngestedSuggestions';
import { LinkCategoryGrid } from './links/LinkCategoryGrid';
import { QuickAddSuggestions } from './links/QuickAddSuggestions';
import { compactUrlDisplay, sectionOf } from './links/utils';
import { YouTubeCrossCategoryPrompt } from './links/YouTubeCrossCategoryPrompt';

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

  // ─────────────────────────────────────────────────────────────────────────────
  // Pending preview handlers (for LinkCategoryGrid)
  // ─────────────────────────────────────────────────────────────────────────────

  const handleAddPendingPreview = useCallback(
    (link: DetectedLink) => {
      void handleAdd(link);
      setPendingPreview(null);
      setClearSignal(c => c + 1);
    },
    [handleAdd]
  );

  const handleCancelPendingPreview = useCallback(() => {
    setPendingPreview(null);
    setClearSignal(c => c + 1);
  }, []);

  // Hint state for drag-and-drop validation messages (from LinkCategoryGrid)
  const [hint, setHint] = useState<string | null>(null);

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

          {/* YouTube cross-category prompt */}
          {ytPrompt && (
            <YouTubeCrossCategoryPrompt
              candidate={ytPrompt.candidate}
              target={ytPrompt.target as 'social' | 'dsp'}
              onConfirm={confirmYtPrompt}
              onCancel={cancelYtPrompt}
              animate={false}
            />
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

          {/* Ingested AI-discovered suggestions */}
          {hasPendingSuggestions && (
            <IngestedSuggestions
              suggestions={pendingSuggestions}
              onAccept={handleAcceptSuggestionClick}
              onDismiss={handleDismissSuggestionClick}
              profileId={profileId}
              suggestionKey={suggestionKey}
            />
          )}

          {/* Quick-add platform suggestion pills */}
          <QuickAddSuggestions
            existingPlatforms={existingPlatforms}
            isMusicProfile={isMusicProfile}
            onPlatformSelect={setPrefillUrl}
          />
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
          <LinkCategoryGrid
            links={links}
            onLinksChange={next => {
              setLinks(next as T[]);
              onLinksChange?.(next as T[]);
            }}
            onToggle={handleToggle}
            onRemove={handleRemove}
            onEdit={handleEdit}
            openMenuId={openMenuId}
            onAnyMenuOpen={handleAnyMenuOpen}
            lastAddedId={lastAddedId}
            buildPillLabel={buildPillLabel}
            addingLink={addingLink}
            pendingPreview={pendingPreview}
            onAddPendingPreview={handleAddPendingPreview}
            onCancelPendingPreview={handleCancelPendingPreview}
            onHint={setHint}
          />
        )}
      </div>
    </section>
  );
}

// Note: All sub-components (SortableLinkItem, QuickAddSuggestions, IngestedSuggestions,
// YouTubeCrossCategoryPrompt, LinkCategoryGrid) are now imported from ./links/
