'use client';

import { Button } from '@jovie/ui';
import Image from 'next/image';
import { useCallback, useMemo, useState } from 'react';
import {
  useApplyGeneratedAlbumArtMutation,
  useCreateReleaseWithGeneratedAlbumArtMutation,
} from '@/lib/queries';
import { cn } from '@/lib/utils';
import type { ChatAlbumArtToolResult } from '../types';

interface ChatAlbumArtCardProps {
  readonly result: ChatAlbumArtToolResult;
  readonly profileId: string;
}

function buildExistingReleasePrompt(title: string, releaseId: string): string {
  return `Generate album art for this release and attach it to the provided release ID.\n${JSON.stringify(
    {
      releaseId,
      releaseTitle: title,
      instruction: 'Show three options.',
    }
  )}`;
}

function buildCreateReleasePrompt(title: string | null): string {
  if (!title?.trim()) {
    return 'Help me create a new release and generate album art for it. Ask me for the release title first.';
  }

  return `Generate album art for a new release and create the release after I pick one option.\n${JSON.stringify(
    {
      createRelease: true,
      releaseTitle: title,
      instruction: 'Show three options.',
    }
  )}`;
}

function submitChatPrompt(prompt: string): void {
  globalThis.dispatchEvent(
    new CustomEvent('jovie-chat-submit-prompt', { detail: { prompt } })
  );
}

export function ChatAlbumArtCard({ result, profileId }: ChatAlbumArtCardProps) {
  const [selectedCandidateId, setSelectedCandidateId] = useState<string | null>(
    result.success && result.state === 'generated'
      ? (result.candidates[0]?.id ?? null)
      : null
  );
  const [appliedCandidateId, setAppliedCandidateId] = useState<string | null>(
    null
  );
  const applyMutation = useApplyGeneratedAlbumArtMutation();
  const createMutation = useCreateReleaseWithGeneratedAlbumArtMutation();

  const selectedCandidate = useMemo(() => {
    if (!result.success || result.state !== 'generated') return null;
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

  const handleApply = useCallback(() => {
    if (!result.success || result.state !== 'generated' || !selectedCandidate) {
      return;
    }

    if (result.releaseId) {
      applyMutation.mutate(
        {
          profileId,
          releaseId: result.releaseId,
          generationId: result.generationId,
          candidateId: selectedCandidate.id,
        },
        {
          onSuccess: () => setAppliedCandidateId(selectedCandidate.id),
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
        candidateId: selectedCandidate.id,
      },
      {
        onSuccess: () => setAppliedCandidateId(selectedCandidate.id),
      }
    );
  }, [applyMutation, createMutation, profileId, result, selectedCandidate]);

  if (!result.success) {
    return (
      <output className='block rounded-xl border border-subtle bg-surface-1 p-3 text-[13px] text-primary-token'>
        <span className='block font-medium'>Album Art Failed</span>
        <span className='mt-1 block text-secondary-token'>{result.error}</span>
        {result.retryable ? (
          <span className='mt-2 block text-[12px] text-tertiary-token'>
            Retry from chat when the provider is available.
          </span>
        ) : null}
      </output>
    );
  }

  if (result.state === 'needs_release_target') {
    return (
      <div className='rounded-xl border border-subtle bg-surface-1 p-3'>
        <div className='text-[13px] font-medium text-primary-token'>
          Choose Release
        </div>
        <div className='mt-2 flex flex-wrap gap-2'>
          {result.suggestedReleases.map(release => (
            <Button
              key={release.id}
              type='button'
              variant='secondary'
              size='sm'
              onClick={() =>
                submitChatPrompt(
                  buildExistingReleasePrompt(release.title, release.id)
                )
              }
            >
              {release.title}
            </Button>
          ))}
          <Button
            type='button'
            variant='secondary'
            size='sm'
            onClick={() =>
              submitChatPrompt(buildCreateReleasePrompt(result.releaseTitle))
            }
          >
            Create Release With Art
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className='rounded-xl border border-subtle bg-surface-1 p-3'>
      <div className='flex items-center justify-between gap-3'>
        <div className='min-w-0'>
          <div className='truncate text-[13px] font-medium text-primary-token'>
            {result.releaseTitle}
          </div>
          <div className='truncate text-[12px] text-secondary-token'>
            {hasAppliedSelectedCandidate ? 'Artwork Applied' : 'Select Artwork'}
          </div>
        </div>
      </div>
      <div className='mt-3 grid grid-cols-3 gap-2 max-sm:flex max-sm:overflow-x-auto'>
        {result.candidates.map(candidate => {
          const isSelected = candidate.id === selectedCandidateId;
          return (
            <button
              key={candidate.id}
              type='button'
              onClick={() => setSelectedCandidateId(candidate.id)}
              className={cn(
                'group relative aspect-square min-w-24 overflow-hidden rounded-lg border bg-surface-2 text-left transition-colors',
                isSelected
                  ? 'border-accent shadow-sm'
                  : 'border-subtle hover:border-secondary-token'
              )}
              aria-pressed={isSelected}
              aria-label={`Select ${candidate.styleLabel} artwork for ${result.releaseTitle}`}
            >
              <Image
                src={candidate.previewUrl}
                alt={`${result.releaseTitle} album art in ${candidate.styleLabel} style`}
                fill
                className='object-cover'
                sizes='160px'
                unoptimized
              />
              <span className='absolute inset-x-1 bottom-1 rounded bg-black/55 px-1.5 py-1 text-[10px] font-medium text-white backdrop-blur'>
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
          {hasAppliedSelectedCandidate
            ? 'Applied'
            : result.releaseId
              ? result.hasExistingArtwork
                ? 'Replace Artwork'
                : 'Use This Art'
              : 'Create Release With Art'}
        </Button>
        <Button
          type='button'
          size='sm'
          variant='secondary'
          disabled={applyMutation.isPending || createMutation.isPending}
          onClick={() =>
            submitChatPrompt(
              result.releaseId
                ? buildExistingReleasePrompt(
                    result.releaseTitle,
                    result.releaseId
                  )
                : buildCreateReleasePrompt(result.releaseTitle)
            )
          }
        >
          Regenerate
        </Button>
      </div>
      {applyMutation.isError || createMutation.isError ? (
        <output className='mt-2 block text-[12px] text-red-500'>
          Could not apply artwork. Try again.
        </output>
      ) : null}
    </div>
  );
}
