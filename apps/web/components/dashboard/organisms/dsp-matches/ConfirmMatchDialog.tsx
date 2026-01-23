'use client';

import { Button } from '@jovie/ui';
import Image from 'next/image';
import { Icon } from '@/components/atoms/Icon';
import { ConfidenceBadge } from '@/components/dashboard/atoms/ConfidenceBadge';
import {
  DspProviderIcon,
  PROVIDER_LABELS,
} from '@/components/dashboard/atoms/DspProviderIcon';
import {
  type ConfidenceBreakdownData,
  MatchConfidenceBreakdown,
} from '@/components/dashboard/molecules/MatchConfidenceBreakdown';
import {
  Dialog,
  DialogActions,
  DialogBody,
  DialogDescription,
  DialogTitle,
} from '@/components/organisms/Dialog';
import type { DspProviderId } from '@/lib/dsp-enrichment/types';
import { isExternalDspImage } from '@/lib/utils/dsp-images';

export interface ConfirmMatchDialogProps {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  isConfirming?: boolean;
  matchData: {
    matchId: string;
    providerId: DspProviderId;
    externalArtistName: string;
    externalArtistUrl?: string | null;
    externalArtistImageUrl?: string | null;
    confidenceScore: number;
    confidenceBreakdown?: ConfidenceBreakdownData;
    matchingIsrcCount: number;
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
        <div className='flex h-8 w-8 items-center justify-center rounded-full bg-green-500/10'>
          <Icon
            name='Link2'
            className='h-4 w-4 text-green-600 dark:text-green-400'
          />
        </div>
        <span>Confirm artist match</span>
      </DialogTitle>

      <DialogDescription>
        This will link your Jovie profile to your {PROVIDER_LABELS[providerId]}{' '}
        artist page, enabling cross-platform syncing.
      </DialogDescription>

      <DialogBody className='space-y-4'>
        {/* Match Preview Card */}
        <div className='rounded-xl border border-subtle bg-surface-2/60 p-4'>
          <div className='flex items-center gap-4'>
            {/* Artist Image */}
            {externalArtistImageUrl ? (
              <Image
                src={externalArtistImageUrl}
                alt={externalArtistName}
                width={64}
                height={64}
                className='rounded-full object-cover ring-2 ring-surface-3'
                unoptimized={isExternalDspImage(externalArtistImageUrl)}
              />
            ) : (
              <div className='flex h-16 w-16 items-center justify-center rounded-full bg-surface-3'>
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
                    className='shrink-0 text-tertiary-token transition-colors hover:text-accent'
                  >
                    <Icon name='ExternalLink' className='h-4 w-4' />
                  </a>
                )}
              </div>

              <div className='mt-1 flex items-center gap-2'>
                <DspProviderIcon provider={providerId} size='sm' showLabel />
              </div>

              <div className='mt-2 flex items-center gap-3'>
                <ConfidenceBadge score={confidenceScore} size='md' showLabel />
                <span className='text-xs text-tertiary-token'>
                  {matchingIsrcCount} matching ISRCs
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Confidence Breakdown */}
        {confidenceBreakdown && (
          <div className='rounded-lg border border-subtle bg-surface-1 p-4'>
            <h4 className='mb-3 text-sm font-medium text-primary-token'>
              Match confidence breakdown
            </h4>
            <MatchConfidenceBreakdown
              breakdown={confidenceBreakdown}
              totalScore={confidenceScore}
            />
          </div>
        )}

        {/* Info note */}
        <div className='flex items-start gap-2 rounded-lg border border-blue-500/30 bg-blue-500/5 p-3'>
          <Icon name='Info' className='mt-0.5 h-4 w-4 shrink-0 text-blue-500' />
          <p className='text-xs text-blue-700 dark:text-blue-300'>
            Once confirmed, we'll automatically sync your releases and tracks
            from {PROVIDER_LABELS[providerId]}. You can unlink this connection
            anytime from your settings.
          </p>
        </div>
      </DialogBody>

      <DialogActions>
        <Button variant='secondary' size='sm' onClick={onClose}>
          Cancel
        </Button>
        <Button
          variant='primary'
          size='sm'
          onClick={onConfirm}
          disabled={isConfirming}
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
