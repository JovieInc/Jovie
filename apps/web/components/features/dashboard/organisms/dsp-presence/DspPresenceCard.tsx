'use client';

import Image from 'next/image';
import type { DspPresenceItem } from '@/app/app/(shell)/dashboard/presence/actions';
import { Icon } from '@/components/atoms/Icon';
import { ContentSurfaceCard } from '@/components/molecules/ContentSurfaceCard';
import { ConfidenceBadge } from '@/features/dashboard/atoms/ConfidenceBadge';
import {
  DspProviderIcon,
  PROVIDER_LABELS,
} from '@/features/dashboard/atoms/DspProviderIcon';
import { MatchStatusBadge } from '@/features/dashboard/atoms/MatchStatusBadge';
import { cn } from '@/lib/utils';
import { isExternalDspImage } from '@/lib/utils/dsp-images';

interface DspPresenceCardProps {
  readonly item: DspPresenceItem;
  readonly isSelected: boolean;
  readonly onSelect: () => void;
}

export function DspPresenceCard({
  item,
  isSelected,
  onSelect,
}: DspPresenceCardProps) {
  const label = PROVIDER_LABELS[item.providerId];
  const isConfirmed =
    item.status === 'confirmed' || item.status === 'auto_confirmed';

  return (
    <ContentSurfaceCard
      className={cn(
        'cursor-pointer p-4 transition-[border-color,background-color,box-shadow] duration-150',
        'hover:border-(--linear-border-default) hover:bg-(--linear-bg-surface-0)',
        isSelected &&
          'border-(--linear-border-focus) ring-1 ring-(--linear-border-focus)'
      )}
      data-testid={`presence-card-${item.providerId}`}
    >
      <button
        type='button'
        onClick={onSelect}
        className='w-full space-y-3 text-left'
      >
        {/* Header: Avatar + Provider info */}
        <div className='flex items-start justify-between gap-3'>
          <div className='flex items-center gap-3'>
            {/* Artist image or provider icon fallback */}
            {item.externalArtistImageUrl ? (
              <div className='relative h-12 w-12 shrink-0 overflow-hidden rounded-full border border-(--linear-border-subtle) bg-(--linear-bg-surface-0)'>
                <Image
                  src={item.externalArtistImageUrl}
                  alt={item.externalArtistName ?? label}
                  fill
                  sizes='48px'
                  className='object-cover'
                  unoptimized={isExternalDspImage(item.externalArtistImageUrl)}
                />
              </div>
            ) : (
              <div className='flex h-12 w-12 items-center justify-center rounded-full border border-(--linear-border-subtle) bg-(--linear-bg-surface-0)'>
                <DspProviderIcon provider={item.providerId} size='lg' />
              </div>
            )}

            <div className='min-w-0 flex-1'>
              <div className='flex items-center gap-2'>
                <span className='truncate font-[510] text-(--linear-text-primary)'>
                  {item.externalArtistName ?? 'Unknown Artist'}
                </span>
              </div>
              <div className='mt-0.5 flex items-center gap-1.5 text-[13px] text-(--linear-text-tertiary)'>
                <DspProviderIcon provider={item.providerId} size='sm' />
                <span>{label}</span>
              </div>
            </div>
          </div>

          {/* Status badge */}
          <div className='shrink-0'>
            <MatchStatusBadge status={item.status} size='sm' />
          </div>
        </div>

        {/* Metrics row */}
        <div className='flex items-center gap-3 text-[13px] text-(--linear-text-tertiary)'>
          {isConfirmed && (
            <ConfidenceBadge score={item.confidenceScore} size='sm' />
          )}
          {item.matchingIsrcCount > 0 && (
            <span>{item.matchingIsrcCount} ISRC matches</span>
          )}
        </div>
      </button>

      {/* External link — outside button to avoid invalid <a> inside <button> */}
      {item.externalArtistUrl && (
        <div className='border-t border-(--linear-border-subtle) pt-3'>
          <a
            href={item.externalArtistUrl}
            target='_blank'
            rel='noopener noreferrer'
            className='inline-flex items-center gap-1.5 text-[13px] text-(--linear-text-tertiary) transition-colors hover:text-(--linear-text-primary)'
          >
            <Icon name='ExternalLink' className='h-3.5 w-3.5' />
            <span>View on {label}</span>
          </a>
        </div>
      )}
    </ContentSurfaceCard>
  );
}
