'use client';

import { Button } from '@jovie/ui';
import Image from 'next/image';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  useApplyGeneratedAlbumArtMutation,
  useCreateReleaseWithGeneratedAlbumArtMutation,
} from '@/lib/queries';
import { cn } from '@/lib/utils';
import type { ChatAlbumArtCandidate, ChatAlbumArtToolResult } from '../types';
import {
  type AlbumArtSwipePreference,
  ChatAlbumArtSwipeReview,
  readAlbumArtSwipePreference,
  writeAlbumArtSwipePreference,
} from './ChatAlbumArtSwipeReview';
import { ChatArtifactErrorCard } from './ChatArtifactErrorCard';
import { ChatGenerationArtifactSurface } from './ChatGenerationArtifactSurface';

interface ChatAlbumArtCardProps {
  readonly result: ChatAlbumArtToolResult;
  readonly profileId: string;
}

/**
 * Dispatch chips into the chat input tray instead of auto-submitting a full
 * prompt. The user sees the chips, can add context, and submits with Enter.
 * `useJovieChat` listens for this event and appends to its chip tray.
 */
function insertReleaseChips(
  release: { id: string; title: string },
  { createRelease = false }: { readonly createRelease?: boolean } = {}
): void {
  // Skill chip first so the transcript keeps action context before the release.
  globalThis.dispatchEvent(
    new CustomEvent('jovie-chat-insert-mention', {
      detail: { skillId: 'generateAlbumArt' },
    })
  );
  if (createRelease) return;
  globalThis.dispatchEvent(
    new CustomEvent('jovie-chat-insert-mention', {
      detail: {
        mention: { kind: 'release', id: release.id, label: release.title },
      },
    })
  );
}

/**
 * For the "Create release with art" path we have no releaseId yet. Drop a
 * skill chip into the tray; the model prompts for a title, user types it,
 * tool creates the release.
 */
function insertCreateReleaseChip(): void {
  globalThis.dispatchEvent(
    new CustomEvent('jovie-chat-insert-mention', {
      detail: { skillId: 'generateAlbumArt' },
    })
  );
}

function ChatAlbumArtCardSuccess({
  result,
  profileId,
}: Readonly<{
  result: Extract<ChatAlbumArtToolResult, { success: true }>;
  profileId: string;
}>) {
  const [selectedCandidateId, setSelectedCandidateId] = useState<string | null>(
    result.state === 'generated' ? (result.candidates[0]?.id ?? null) : null
  );
  const [appliedCandidateId, setAppliedCandidateId] = useState<string | null>(
    null
  );
  const [swipePreference, setSwipePreference] =
    useState<AlbumArtSwipePreference>('undecided');
  const applyMutation = useApplyGeneratedAlbumArtMutation();
  const createMutation = useCreateReleaseWithGeneratedAlbumArtMutation();

  // Read the stored preference after mount so SSR and first client render
  // agree; `undecided` shows the one-time onboarding prompt.
  useEffect(() => {
    setSwipePreference(readAlbumArtSwipePreference());
  }, []);

  const chooseSwipePreference = useCallback(
    (preference: Exclude<AlbumArtSwipePreference, 'undecided'>) => {
      writeAlbumArtSwipePreference(preference);
      setSwipePreference(preference);
    },
    []
  );

  const selectedCandidate = useMemo(() => {
    if (result.state !== 'generated') return null;
    return (
      result.candidates.find(
        candidate => candidate.id === selectedCandidateId
      ) ?? null
    );
  }, [result, selectedCandidateId]);

  const hasAppliedSelectedCandidate =
    appliedCandidateId !== null &&
    selectedCandidateId !== null &&
    appliedCandidateId === selectedCandidateId;

  const applyCandidate = useCallback(
    (candidate: ChatAlbumArtCandidate) => {
      if (result.state !== 'generated') {
        return;
      }

      if (result.releaseId) {
        applyMutation.mutate(
          {
            profileId,
            releaseId: result.releaseId,
            generationId: result.generationId,
            candidateId: candidate.id,
          },
          {
            onSuccess: () => setAppliedCandidateId(candidate.id),
          }
        );
        return;
      }

      createMutation.mutate(
        {
          profileId,
          title: result.releaseTitle,
          releaseType: 'single',
          generationId: result.generationId,
          candidateId: candidate.id,
        },
        {
          onSuccess: () => setAppliedCandidateId(candidate.id),
        }
      );
    },
    [applyMutation, createMutation, profileId, result]
  );

  const handleApply = useCallback(() => {
    if (!selectedCandidate) return;
    applyCandidate(selectedCandidate);
  }, [applyCandidate, selectedCandidate]);

  if (result.state === 'needs_release_target') {
    return (
      <ChatGenerationArtifactSurface title='Choose Release'>
        <div className='flex flex-wrap gap-2'>
          {result.suggestedReleases.map(release => (
            <Button
              key={release.id}
              type='button'
              variant='secondary'
              size='sm'
              onClick={() =>
                insertReleaseChips({ id: release.id, title: release.title })
              }
            >
              {release.title}
            </Button>
          ))}
          <Button
            type='button'
            variant='secondary'
            size='sm'
            onClick={() => insertCreateReleaseChip()}
          >
            Create Release With Art
          </Button>
        </div>
      </ChatGenerationArtifactSurface>
    );
  }

  let applyButtonLabel = 'Use This Art';
  if (hasAppliedSelectedCandidate) applyButtonLabel = 'Applied';
  else if (!result.releaseId) applyButtonLabel = 'Create Release With Art';
  else if (result.hasExistingArtwork) applyButtonLabel = 'Replace Artwork';

  const swipeModeActive = swipePreference === 'on';
  const showSwipeOnboarding = swipePreference === 'undecided';
  const requestAnotherSet = () =>
    result.releaseId
      ? insertReleaseChips({ id: result.releaseId, title: result.releaseTitle })
      : insertCreateReleaseChip();

  return (
    <ChatGenerationArtifactSurface
      title={result.releaseTitle}
      subtitle={
        appliedCandidateId !== null ? 'Artwork Applied' : 'Select Artwork'
      }
    >
      {showSwipeOnboarding ? (
        <div
          data-testid='album-art-swipe-onboarding'
          className='mt-3 rounded-lg border border-subtle bg-surface-1 p-3'
        >
          <p className='text-xs text-secondary-token'>
            Review artwork one card at a time — swipe right to keep it, left to
            see the next.
          </p>
          <div className='mt-2 flex flex-wrap gap-2'>
            <Button
              type='button'
              size='sm'
              onClick={() => chooseSwipePreference('on')}
            >
              Try Swipe Review
            </Button>
            <Button
              type='button'
              size='sm'
              variant='secondary'
              onClick={() => chooseSwipePreference('off')}
            >
              Keep Grid
            </Button>
          </div>
        </div>
      ) : null}
      {swipeModeActive ? (
        <ChatAlbumArtSwipeReview
          releaseTitle={result.releaseTitle}
          candidates={result.candidates}
          appliedCandidateId={appliedCandidateId}
          isActionPending={applyMutation.isPending || createMutation.isPending}
          onAccept={applyCandidate}
          onRequestMore={requestAnotherSet}
          onExitSwipeMode={() => chooseSwipePreference('off')}
        />
      ) : (
        <>
          <div className='mt-3 grid grid-cols-3 gap-2 max-sm:flex max-sm:overflow-x-auto'>
            {result.candidates.map(candidate => {
              const isSelected = candidate.id === selectedCandidateId;
              return (
                <button
                  key={candidate.id}
                  type='button'
                  onClick={() => setSelectedCandidateId(candidate.id)}
                  className={cn(
                    'group min-w-24 overflow-hidden rounded-lg border bg-surface-2 text-left transition-colors',
                    isSelected
                      ? 'border-cyan-400/60 shadow-[inset_0_0_0_1px_rgb(103_232_249_/_0.18)]'
                      : 'border-subtle hover:border-secondary-token'
                  )}
                  aria-pressed={isSelected}
                  aria-label={`Select ${candidate.styleLabel} artwork for ${result.releaseTitle}`}
                >
                  <span className='relative block aspect-square w-full bg-surface-1'>
                    <Image
                      src={candidate.previewUrl}
                      alt={`${result.releaseTitle} album art in ${candidate.styleLabel} style`}
                      fill
                      className='object-contain'
                      sizes='160px'
                      unoptimized
                    />
                  </span>
                  <span className='block border-t border-subtle px-2 py-1.5 text-3xs font-medium text-secondary-token'>
                    {candidate.styleLabel}
                  </span>
                </button>
              );
            })}
          </div>
          <div className='mt-3 flex flex-wrap items-center gap-2'>
            <Button
              type='button'
              size='sm'
              onClick={handleApply}
              disabled={
                !selectedCandidate ||
                applyMutation.isPending ||
                createMutation.isPending ||
                hasAppliedSelectedCandidate
              }
            >
              {applyButtonLabel}
            </Button>
            <Button
              type='button'
              size='sm'
              variant='secondary'
              disabled={applyMutation.isPending || createMutation.isPending}
              onClick={requestAnotherSet}
            >
              Regenerate
            </Button>
          </div>
        </>
      )}
      {applyMutation.isError || createMutation.isError ? (
        <output className='mt-2 block text-xs text-error'>
          Could not apply artwork. Try again.
        </output>
      ) : null}
    </ChatGenerationArtifactSurface>
  );
}

export function ChatAlbumArtCard({ result, profileId }: ChatAlbumArtCardProps) {
  if (!result.success) {
    return (
      <ChatArtifactErrorCard
        title='Album Art Failed'
        message={result.error}
        retryPrompt='Please retry generating album art.'
        showRetry={result.retryable}
      />
    );
  }

  return <ChatAlbumArtCardSuccess result={result} profileId={profileId} />;
}
