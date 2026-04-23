'use client';

import { Button } from '@jovie/ui';
import Image from 'next/image';
import { Icon } from '@/components/atoms/Icon';
import { ContentSurfaceCard } from '@/components/molecules/ContentSurfaceCard';
import {
  Dialog,
  DialogActions,
  DialogBody,
  DialogDescription,
  DialogTitle,
} from '@/components/organisms/Dialog';
import { ConfidenceBadge } from '@/features/dashboard/atoms/ConfidenceBadge';
import {
  DspProviderIcon,
  PROVIDER_LABELS,
} from '@/features/dashboard/atoms/DspProviderIcon';
import {
  type ConfidenceBreakdownData,
  MatchConfidenceBreakdown,
} from '@/features/dashboard/molecules/MatchConfidenceBreakdown';
import type { DspProviderId } from '@/lib/dsp-enrichment/types';
import { isExternalDspImage } from '@/lib/utils/dsp-images';

export interface ConfirmMatchDialogProps {
  readonly open: boolean;
  readonly onClose: () => void;
  readonly onConfirm: () => void;
  readonly isConfirming?: boolean;
  readonly matchData: {
    readonly matchId: string;
    readonly providerId: DspProviderId;
    readonly externalArtistName: string;
    readonly externalArtistUrl?: string | null;
    readonly externalArtistImageUrl?: string | null;
    readonly confidenceScore: number;
    readonly confidenceBreakdown?: ConfidenceBreakdownData;
    readonly matchingIsrcCount: number;
  } | null;
}

/**
 * ConfirmMatchDialog - Confirmation dialog for DSP artist matches.
 *
 * Shows detailed match information including:
 * - Artist image and name
 * - Provider details
 * - Full confidence breakdown
 * - ISRC match count
 *
 * @example
 * <ConfirmMatchDialog
 *   open={isOpen}
 *   onClose={() => setIsOpen(false)}
 *   onConfirm={handleConfirm}
 *   matchData={{
 *     matchId: "123",
 *     providerId: "apple_music",
 *     externalArtistName: "Taylor Swift",
 *     confidenceScore: 0.92,
 *     matchingIsrcCount: 15,
 *   }}
 * />
 */
export function ConfirmMatchDialog({
  open,
  onClose,
  onConfirm,
  isConfirming = false,
  matchData,
}: ConfirmMatchDialogProps) {
  if (!matchData) {
    return null;
  }

  const {
    providerId,
    externalArtistName,
    externalArtistUrl,
    externalArtistImageUrl,
    confidenceScore,
    confidenceBreakdown,
    matchingIsrcCount,
  } = matchData;

  return (
    <Dialog open={open} onClose={onClose} size='md'>
      <DialogTitle className='flex items-center gap-3'>
        <div className='flex h-8 w-8 items-center justify-center rounded-[8px] border border-(--linear-app-frame-seam) bg-surface-0'>
          <Icon name='Link2' className='h-4 w-4 text-secondary-token' />
        </div>
        <span>Confirm artist match</span>
      </DialogTitle>

      <DialogDescription>
        This will link your Jovie profile to your {PROVIDER_LABELS[providerId]}{' '}
        artist page, enabling cross-platform syncing.
      </DialogDescription>

      <DialogBody className='space-y-4'>
        {/* Match Preview Card */}
        <ContentSurfaceCard surface='details' className='p-4'>
          <div className='flex items-center gap-4'>
            {/* Artist Image */}
            {externalArtistImageUrl ? (
              <Image
                src={externalArtistImageUrl}
                alt={externalArtistName}
                width={64}
                height={64}
                sizes='64px'
                className='rounded-[10px] object-cover'
                unoptimized={isExternalDspImage(externalArtistImageUrl)}
              />
            ) : (
              <div className='flex h-16 w-16 items-center justify-center rounded-[10px] border border-(--linear-app-frame-seam) bg-surface-0'>
                <DspProviderIcon provider={providerId} size='lg' />
              </div>
            )}

            {/* Artist Info */}
            <div className='min-w-0 flex-1'>
              <div className='flex items-center gap-2'>
                <h3 className='truncate text-lg font-semibold text-primary-token'>
                  {externalArtistName}
                </h3>
                {externalArtistUrl && (
                  <a
                    href={externalArtistUrl}
                    target='_blank'
                    rel='noopener noreferrer'
                    className='flex h-6 w-6 shrink-0 items-center justify-center rounded-[8px] border border-transparent text-tertiary-token transition-[background-color,border-color,color] duration-150 hover:border-(--linear-app-frame-seam) hover:bg-surface-0 hover:text-primary-token'
                  >
                    <Icon name='ExternalLink' className='h-4 w-4' />
                  </a>
                )}
              </div>

              <div className='mt-1 flex items-center gap-2'>
                <DspProviderIcon provider={providerId} size='sm' showLabel />
              </div>

              <div className='mt-2 flex flex-wrap items-center gap-2'>
                <ConfidenceBadge score={confidenceScore} size='md' showLabel />
                <span className='rounded-[6px] border border-(--linear-app-frame-seam) bg-surface-0 px-1.5 py-0.5 text-[10px] font-caption text-secondary-token'>
                  {matchingIsrcCount} matching ISRCs
                </span>
              </div>
            </div>
          </div>
        </ContentSurfaceCard>

        {/* Confidence Breakdown */}
        {confidenceBreakdown && (
          <ContentSurfaceCard surface='details' className='p-4'>
            <h4 className='mb-3 text-[13px] font-caption text-primary-token'>
              Match confidence breakdown
            </h4>
            <MatchConfidenceBreakdown
              breakdown={confidenceBreakdown}
              totalScore={confidenceScore}
            />
          </ContentSurfaceCard>
        )}

        {/* Info note */}
        <ContentSurfaceCard className='flex items-start gap-2 border-sky-500/15 bg-sky-500/5 p-3'>
          <Icon
            name='Info'
            className='mt-0.5 h-4 w-4 shrink-0 text-sky-600 dark:text-sky-300'
          />
          <p className='text-xs text-sky-700 dark:text-sky-300'>
            Once confirmed, we&apos;ll automatically sync your releases and
            tracks from {PROVIDER_LABELS[providerId]}. You can unlink this
            connection anytime from your settings.
          </p>
        </ContentSurfaceCard>
      </DialogBody>

      <DialogActions>
        <Button
          variant='secondary'
          size='sm'
          onClick={onClose}
          className='h-7 rounded-[8px] px-2.5 text-[11px] font-caption'
        >
          Cancel
        </Button>
        <Button
          variant='primary'
          size='sm'
          onClick={onConfirm}
          disabled={isConfirming}
          className='h-7 rounded-[8px] px-2.5 text-[11px] font-caption'
        >
          {isConfirming ? (
            <>
              <Icon name='Loader2' className='h-4 w-4 animate-spin' />
              Confirming...
            </>
          ) : (
            'Confirm Match'
          )}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
