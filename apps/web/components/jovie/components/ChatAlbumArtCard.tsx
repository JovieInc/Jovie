'use client';

import { Check, Loader2 } from 'lucide-react';
import Image from 'next/image';
import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { applyGeneratedReleaseAlbumArt } from '@/app/app/(shell)/dashboard/releases/actions';
import { cn } from '@/lib/utils';

interface ChatAlbumArtCardProps {
  readonly state: 'loading' | 'success' | 'error';
  readonly releaseId?: string;
  readonly sessionId?: string;
  readonly releaseTitle?: string;
  readonly brandKitName?: string | null;
  readonly quotaRemaining?: number | null;
  readonly usedMatchingTemplate?: boolean;
  readonly options?: ReadonlyArray<{
    readonly id: string;
    readonly previewUrl: string;
  }>;
  readonly error?: string;
}

export function ChatAlbumArtCard({
  state,
  releaseId,
  sessionId,
  releaseTitle,
  brandKitName,
  quotaRemaining,
  usedMatchingTemplate = false,
  options,
  error,
}: ChatAlbumArtCardProps) {
  const [selectedOptionId, setSelectedOptionId] = useState<string | null>(
    options?.[0]?.id ?? null
  );
  const [isApplying, setIsApplying] = useState(false);
  const [isApplied, setIsApplied] = useState(false);

  useEffect(() => {
    setSelectedOptionId(options?.[0]?.id ?? null);
    setIsApplied(false);
  }, [options, sessionId]);

  const handleApply = useCallback(async () => {
    if (!releaseId || !sessionId || !selectedOptionId) {
      return;
    }

    setIsApplying(true);
    try {
      await applyGeneratedReleaseAlbumArt({
        releaseId,
        sessionId,
        optionId: selectedOptionId,
      });
      setIsApplied(true);
      toast.success('Album art applied. The release drawer will reflect it.');
    } catch (applyError) {
      toast.error(
        applyError instanceof Error
          ? applyError.message
          : 'Failed to apply album art.'
      );
    } finally {
      setIsApplying(false);
    }
  }, [releaseId, selectedOptionId, sessionId]);

  return (
    <div className='mt-2 overflow-hidden rounded-[16px] border border-subtle bg-surface-0'>
      <div className='border-b border-subtle px-4 py-3'>
        <p className='text-[13px] font-[560] text-primary-token'>
          {state === 'loading'
            ? 'Generating Album Art'
            : releaseTitle
              ? `Album Art For ${releaseTitle}`
              : 'Album Art'}
        </p>
        <p className='mt-1 text-[12px] text-secondary-token'>
          {state === 'loading'
            ? 'Building cover options...'
            : state === 'error'
              ? (error ?? 'Generation failed.')
              : isApplied
                ? 'Applied to the release.'
                : 'Pick an option and apply it directly, or reopen the release drawer later.'}
        </p>
        {state === 'success' &&
        (brandKitName ||
          usedMatchingTemplate ||
          quotaRemaining !== undefined) ? (
          <p className='mt-1 text-[11px] text-tertiary-token'>
            {[
              usedMatchingTemplate ? 'Using matching release design' : null,
              brandKitName ? `Series template: ${brandKitName}` : null,
              quotaRemaining !== null && quotaRemaining !== undefined
                ? quotaRemaining > 0
                  ? `${quotaRemaining} run${quotaRemaining === 1 ? '' : 's'} left`
                  : 'No runs left'
                : null,
            ]
              .filter(Boolean)
              .join(' • ')}
          </p>
        ) : null}
      </div>
      {state === 'success' && options?.length ? (
        <>
          <div className='grid grid-cols-3 gap-2 p-3'>
            {options.map(option => (
              <button
                key={option.id}
                type='button'
                onClick={() => setSelectedOptionId(option.id)}
                aria-pressed={selectedOptionId === option.id}
                className={cn(
                  'relative aspect-square overflow-hidden rounded-[12px] border transition-colors',
                  selectedOptionId === option.id
                    ? 'border-primary-token'
                    : 'border-subtle hover:border-default'
                )}
              >
                <Image
                  src={option.previewUrl}
                  alt='Generated album art preview'
                  fill
                  className='object-cover'
                  sizes='160px'
                  unoptimized
                />
              </button>
            ))}
          </div>
          {releaseId && sessionId ? (
            <div className='flex items-center gap-2 border-t border-subtle px-3 py-3'>
              <button
                type='button'
                onClick={() => void handleApply()}
                disabled={isApplying || isApplied || !selectedOptionId}
                className='inline-flex h-8 items-center gap-2 rounded-[9px] bg-primary-token px-3 text-[12px] font-[560] text-white disabled:opacity-60'
              >
                {isApplying ? (
                  <Loader2 className='h-3.5 w-3.5 animate-spin' />
                ) : isApplied ? (
                  <Check className='h-3.5 w-3.5' />
                ) : null}
                <span>{isApplied ? 'Applied' : 'Apply To Release'}</span>
              </button>
            </div>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
