'use client';

import { Button } from '@jovie/ui';
import Image from 'next/image';
import { useState } from 'react';
import { Icon } from '@/components/atoms/Icon';
import { ContentSurfaceCard } from '@/components/molecules/ContentSurfaceCard';
import { ConfidenceBadge } from '@/features/dashboard/atoms/ConfidenceBadge';
import {
  DspProviderIcon,
  PROVIDER_LABELS,
} from '@/features/dashboard/atoms/DspProviderIcon';
import { MatchStatusBadge } from '@/features/dashboard/atoms/MatchStatusBadge';
import type { DspMatchStatus, DspProviderId } from '@/lib/dsp-enrichment/types';
import { cn } from '@/lib/utils';
import { isExternalDspImage } from '@/lib/utils/dsp-images';

import { MatchConfidenceBreakdown } from './MatchConfidenceBreakdown';

export interface DspMatchCardProps {
  readonly matchId: string;
  readonly providerId: DspProviderId;
  readonly externalArtistName: string;
  readonly externalArtistUrl?: string | null;
  readonly externalArtistImageUrl?: string | null;
  readonly confidenceScore: number;
  readonly confidenceBreakdown?: {
    readonly isrcMatchScore: number;
    readonly upcMatchScore: number;
    readonly nameSimilarityScore: number;
    readonly followerRatioScore: number;
    readonly genreOverlapScore: number;
  };
  readonly matchingIsrcCount: number;
  readonly status: DspMatchStatus;
  readonly onConfirm?: (matchId: string) => void;
  readonly onReject?: (matchId: string) => void;
  readonly isConfirming?: boolean;
  readonly isRejecting?: boolean;
  readonly className?: string;
}

/**
 * DspMatchCard - Displays a DSP artist match suggestion.
 *
 * Shows:
 * - Provider icon and name
 * - External artist name with link
 * - Confidence score badge
 * - Match status badge
 * - Expandable confidence breakdown
 * - Confirm/Reject actions (for suggested matches)
 *
 * @example
 * <DspMatchCard
 *   matchId="123"
 *   providerId="apple_music"
 *   externalArtistName="Taylor Swift"
 *   externalArtistUrl="https://music.apple.com/artist/..."
 *   confidenceScore={0.92}
 *   matchingIsrcCount={15}
 *   status="suggested"
 *   onConfirm={handleConfirm}
 *   onReject={handleReject}
 * />
 */
export function DspMatchCard({
  matchId,
  providerId,
  externalArtistName,
  externalArtistUrl,
  externalArtistImageUrl,
  confidenceScore,
  confidenceBreakdown,
  matchingIsrcCount,
  status,
  onConfirm,
  onReject,
  isConfirming = false,
  isRejecting = false,
  className,
}: DspMatchCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const isSuggested = status === 'suggested';
  const isActionable = isSuggested && (onConfirm || onReject);
  const isLoading = isConfirming || isRejecting;

  return (
    <ContentSurfaceCard
      surface='details'
      className={cn(
        'p-3.5 transition-[border-color,background-color,box-shadow] duration-150 hover:border-default hover:bg-surface-0',
        className
      )}
    >
      {/* Header */}
      <div className='flex items-start justify-between gap-3'>
        <div className='flex items-center gap-3'>
          {/* Provider Icon or Artist Image */}
          {externalArtistImageUrl ? (
            <div className='relative h-10 w-10 shrink-0 overflow-hidden rounded-[10px] border border-(--linear-app-frame-seam) bg-surface-0'>
              <Image
                src={externalArtistImageUrl}
                alt={externalArtistName}
                fill
                sizes='40px'
                className='object-cover'
                unoptimized={isExternalDspImage(externalArtistImageUrl)}
              />
            </div>
          ) : (
            <div className='flex h-10 w-10 items-center justify-center rounded-[10px] border border-(--linear-app-frame-seam) bg-surface-0'>
              <DspProviderIcon provider={providerId} size='lg' />
            </div>
          )}

          {/* Artist Info */}
          <div className='min-w-0 flex-1'>
            <div className='flex items-center gap-2'>
              <span className='truncate font-caption text-primary-token'>
                {externalArtistName}
              </span>
              {externalArtistUrl && (
                <a
                  href={externalArtistUrl}
                  target='_blank'
                  rel='noopener noreferrer'
                  className='flex h-6 w-6 shrink-0 items-center justify-center rounded-lg border border-transparent text-tertiary-token transition-[background-color,border-color,color] duration-150 hover:border-(--linear-app-frame-seam) hover:bg-surface-0 hover:text-primary-token'
                  title={`View on ${PROVIDER_LABELS[providerId]}`}
                >
                  <Icon name='ExternalLink' className='h-3.5 w-3.5' />
                </a>
              )}
            </div>
            <div className='mt-0.5 flex items-center gap-2 text-app text-tertiary-token'>
              <DspProviderIcon provider={providerId} size='sm' />
              <span>{PROVIDER_LABELS[providerId]}</span>
              <span className='text-quaternary-token'>•</span>
              <span>{matchingIsrcCount} ISRC matches</span>
            </div>
          </div>
        </div>

        {/* Status & Confidence Badges */}
        <div className='flex shrink-0 flex-col items-end gap-1.5'>
          <MatchStatusBadge status={status} size='sm' />
          <ConfidenceBadge score={confidenceScore} size='sm' />
        </div>
      </div>

      {/* Expandable Confidence Breakdown */}
      {confidenceBreakdown && (
        <div className='mt-3 border-t border-(--linear-app-frame-seam) pt-3'>
          <button
            type='button'
            onClick={() => setIsExpanded(!isExpanded)}
            className='flex h-7 w-full items-center justify-between rounded-lg border border-transparent px-2 text-xs text-tertiary-token transition-[background-color,border-color,color] duration-150 hover:border-(--linear-app-frame-seam) hover:bg-surface-0 hover:text-secondary-token focus-visible:outline-none focus-visible:border-(--linear-border-focus) focus-visible:bg-surface-0 focus-visible:ring-1 focus-visible:ring-(--linear-border-focus)'
          >
            <span>Confidence breakdown</span>
            <Icon
              name={isExpanded ? 'ChevronUp' : 'ChevronDown'}
              className='h-3.5 w-3.5'
            />
          </button>

          {isExpanded && (
            <div className='mt-2'>
              <MatchConfidenceBreakdown
                breakdown={confidenceBreakdown}
                totalScore={confidenceScore}
              />
            </div>
          )}
        </div>
      )}

      {/* Actions */}
      {isActionable && (
        <div className='mt-3 flex items-center justify-end gap-2 border-t border-(--linear-app-frame-seam) pt-3'>
          {onReject && (
            <Button
              variant='ghost'
              size='sm'
              onClick={() => onReject(matchId)}
              disabled={isLoading}
              className='h-7 rounded-lg border border-(--linear-app-frame-seam) bg-surface-0 px-2.5 text-2xs font-caption text-secondary-token hover:bg-surface-1 hover:text-primary-token'
            >
              {isRejecting ? 'Rejecting...' : 'Reject'}
            </Button>
          )}
          {onConfirm && (
            <Button
              variant='primary'
              size='sm'
              onClick={() => onConfirm(matchId)}
              disabled={isLoading}
              className='h-7 rounded-lg px-2.5 text-2xs font-caption'
            >
              {isConfirming ? 'Confirming...' : 'Confirm Match'}
            </Button>
          )}
        </div>
      )}
    </ContentSurfaceCard>
  );
}
