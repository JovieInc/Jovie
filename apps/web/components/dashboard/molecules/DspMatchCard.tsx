'use client';

import { Button } from '@jovie/ui';
import Image from 'next/image';
import { useState } from 'react';

import { Icon } from '@/components/atoms/Icon';
import { ConfidenceBadge } from '@/components/dashboard/atoms/ConfidenceBadge';
import {
  DspProviderIcon,
  PROVIDER_LABELS,
} from '@/components/dashboard/atoms/DspProviderIcon';
import { MatchStatusBadge } from '@/components/dashboard/atoms/MatchStatusBadge';
import type { DspMatchStatus, DspProviderId } from '@/lib/dsp-enrichment/types';
import { cn } from '@/lib/utils';

import { MatchConfidenceBreakdown } from './MatchConfidenceBreakdown';

export interface DspMatchCardProps {
  matchId: string;
  providerId: DspProviderId;
  externalArtistName: string;
  externalArtistUrl?: string | null;
  externalArtistImageUrl?: string | null;
  confidenceScore: number;
  confidenceBreakdown?: {
    isrcMatchScore: number;
    upcMatchScore: number;
    nameSimilarityScore: number;
    followerRatioScore: number;
    genreOverlapScore: number;
  };
  matchingIsrcCount: number;
  status: DspMatchStatus;
  onConfirm?: (matchId: string) => void;
  onReject?: (matchId: string) => void;
  isConfirming?: boolean;
  isRejecting?: boolean;
  className?: string;
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
    <div
      className={cn(
        'rounded-lg border border-subtle bg-surface-1 p-4',
        'transition-shadow hover:shadow-sm',
        className
      )}
    >
      {/* Header */}
      <div className='flex items-start justify-between gap-3'>
        <div className='flex items-center gap-3'>
          {/* Provider Icon or Artist Image */}
          {externalArtistImageUrl ? (
            <Image
              src={externalArtistImageUrl}
              alt={externalArtistName}
              width={40}
              height={40}
              className='rounded-full object-cover'
              unoptimized={externalArtistImageUrl.includes('i.scdn.co')}
            />
          ) : (
            <div className='flex h-10 w-10 items-center justify-center rounded-full bg-surface-2'>
              <DspProviderIcon provider={providerId} size='lg' />
            </div>
          )}

          {/* Artist Info */}
          <div className='min-w-0 flex-1'>
            <div className='flex items-center gap-2'>
              <span className='truncate font-medium text-primary-token'>
                {externalArtistName}
              </span>
              {externalArtistUrl && (
                <a
                  href={externalArtistUrl}
                  target='_blank'
                  rel='noopener noreferrer'
                  className='shrink-0 text-tertiary-token transition-colors hover:text-secondary-token'
                  title={`View on ${PROVIDER_LABELS[providerId]}`}
                >
                  <Icon name='ExternalLink' className='h-3.5 w-3.5' />
                </a>
              )}
            </div>
            <div className='mt-0.5 flex items-center gap-2 text-xs text-tertiary-token'>
              <DspProviderIcon provider={providerId} size='sm' />
              <span>{PROVIDER_LABELS[providerId]}</span>
              <span className='text-tertiary-token/50'>•</span>
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
        <div className='mt-3 border-t border-subtle pt-3'>
          <button
            type='button'
            onClick={() => setIsExpanded(!isExpanded)}
            className='flex w-full items-center justify-between text-xs text-tertiary-token transition-colors hover:text-secondary-token'
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
        <div className='mt-3 flex items-center justify-end gap-2 border-t border-subtle pt-3'>
          {onReject && (
            <Button
              variant='ghost'
              size='sm'
              onClick={() => onReject(matchId)}
              disabled={isLoading}
              className='text-xs'
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
              className='text-xs'
            >
              {isConfirming ? 'Confirming...' : 'Confirm Match'}
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
