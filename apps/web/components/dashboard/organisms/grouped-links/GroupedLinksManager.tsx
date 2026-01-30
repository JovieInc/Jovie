'use client';

import { AnimatePresence, motion } from 'motion/react';
import { memo, useCallback, useMemo, useRef, useState } from 'react';
import {
  UniversalLinkInput,
  type UniversalLinkInputRef,
} from '@/components/dashboard/molecules/universal-link-input';
import { EmptyState } from '@/components/organisms/EmptyState';
import { cn } from '@/lib/utils';
import type { DetectedLink } from '@/lib/utils/platform-detection';
import { ChatStyleLinkList } from '../links/ChatStyleLinkList';
import {
  type SuggestedLink,
  useLinksManager,
  useSuggestions,
} from '../links/hooks';
import { IngestedSuggestions } from '../links/IngestedSuggestions';
import { QuickAddSuggestions } from '../links/QuickAddSuggestions';
import { YouTubeCrossCategoryPrompt } from '../links/YouTubeCrossCategoryPrompt';
import { buildPillLabel } from './buildPillLabel';
import type { GroupedLinksManagerProps } from './types';
import { usePendingPreview } from './usePendingPreview';
import { useSuggestionHandlers } from './useSuggestionHandlers';

function GroupedLinksManagerInner<T extends DetectedLink = DetectedLink>({
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
  sidebarOpen = false,
}: GroupedLinksManagerProps<T>) {
  // Link state management
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

  // Suggestion state management
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

  // Menu state
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const handleAnyMenuOpen = useCallback((id: string | null) => {
    setOpenMenuId(id);
  }, []);

  // Refs
  const containerRef = useRef<HTMLDivElement | null>(null);
  const linkInputRef = useRef<UniversalLinkInputRef | null>(null);
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);

  // Pending preview management
  const {
    pendingPreview,
    clearSignal,
    handleAddPendingPreview,
    handleCancelPendingPreview,
    handlePreviewChange,
  } = usePendingPreview({ onAdd: handleAdd });

  // Combined memoization to reduce iterations over links array
  const { existingPlatforms, existingNormalizedUrlPlatforms } = useMemo(() => {
    const platforms = new Set<string>();
    const urlPlatforms = new Map<string, Set<string>>();

    for (const link of links) {
      platforms.add(link.platform.id);

      const normalizedUrl = link.normalizedUrl;
      if (normalizedUrl) {
        const existing = urlPlatforms.get(normalizedUrl);
        if (existing) {
          existing.add(link.platform.id);
        } else {
          urlPlatforms.set(normalizedUrl, new Set([link.platform.id]));
        }
      }
    }

    return {
      existingPlatforms: platforms,
      existingNormalizedUrlPlatforms: urlPlatforms,
    };
  }, [links]);

  // Suggestion handlers
  const { handleAcceptSuggestionClick, handleDismissSuggestionClick } =
    useSuggestionHandlers<T>({
      existingNormalizedUrlPlatforms,
      setLinks,
      insertLinkWithSectionOrdering,
      onLinkAdded,
      handleAcceptSuggestionFromHook,
      handleDismissSuggestionFromHook,
    });

  // Memoize platform IDs for UniversalLinkInput to prevent unnecessary re-renders
  const existingPlatformIds = useMemo(
    () =>
      links.filter(l => l.platform.id !== 'youtube').map(l => l.platform.id),
    [links]
  );

  const hasAnyLinks = links.length > 0;

  // Hint state for drag-and-drop validation messages
  const [hint, setHint] = useState<string | null>(null);

  // Shared input section component
  const inputSection = (
    <>
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

      {/* Prompt text when sidebar is open */}
      {sidebarOpen && (
        <p className='text-sm text-secondary-token'>
          What other profiles do you have?
        </p>
      )}

      {/* Combined search + add input */}
      <UniversalLinkInput
        ref={linkInputRef}
        onAdd={handleAdd}
        existingPlatforms={existingPlatformIds}
        creatorName={creatorName}
        prefillUrl={prefillUrl}
        onPrefillConsumed={clearPrefillUrl}
        onQueryChange={() => {}}
        onPreviewChange={handlePreviewChange}
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
    </>
  );

  // Mode 1: Sidebar Open - vertically centered input
  if (sidebarOpen) {
    return (
      <section
        className={cn('flex h-full flex-col', className)}
        aria-label='Links Manager'
        ref={containerRef}
        data-testid='grouped-links-manager'
      >
        <div className='flex flex-1 flex-col items-center justify-center px-4'>
          <div className='w-full max-w-2xl space-y-3'>{inputSection}</div>
        </div>
      </section>
    );
  }

  // Mode 2: Sidebar Closed, No Links - input at top with empty state
  if (!hasAnyLinks) {
    return (
      <section
        className={cn('space-y-2', className)}
        aria-label='Links Manager'
        ref={containerRef}
        data-testid='grouped-links-manager'
      >
        <div className='mx-auto w-full max-w-3xl space-y-3'>{inputSection}</div>
        <div className='mx-auto w-full max-w-3xl'>
          <EmptyState
            heading='Add your first link'
            description='Start with your most important link — music, socials, or a landing page.'
            size='sm'
            className='mt-3 w-full'
          />
        </div>
      </section>
    );
  }

  // Mode 3: Sidebar Closed, Has Links - chat mode (links scrollable, input at bottom)
  return (
    <section
      className={cn('flex h-full flex-col', className)}
      aria-label='Links Manager'
      ref={containerRef}
      data-testid='grouped-links-manager'
    >
      {/* Scrollable links area */}
      <section
        ref={scrollContainerRef}
        className='flex-1 overflow-y-auto px-4 py-6'
        aria-label='Links list'
      >
        <div className='mx-auto max-w-2xl'>
          <ChatStyleLinkList
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
            scrollContainerRef={scrollContainerRef}
          />
        </div>
      </section>

      {/* Input at bottom */}
      <div className='border-t border-subtle bg-base px-4 py-4'>
        <div className='mx-auto max-w-2xl space-y-3'>{inputSection}</div>
      </div>
    </section>
  );
}

// Wrap with React.memo to prevent unnecessary re-renders when parent state changes
export const GroupedLinksManager = memo(
  GroupedLinksManagerInner
) as typeof GroupedLinksManagerInner;
