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
        'cursor-pointer p-3 transition-[border-color,background-color,box-shadow] duration-150',
        'bg-(--linear-app-content-surface) hover:border-default hover:bg-(--linear-app-content-surface)',
        isSelected &&
          'border-(--linear-border-focus) bg-(--linear-app-content-surface) shadow-[inset_0_0_0_1px_color-mix(in_oklab,var(--linear-border-focus)_24%,transparent)]'
      )}
      data-testid={`presence-card-${item.providerId}`}
    >
      <button
        type='button'
        onClick={onSelect}
        className='w-full space-y-2 text-left'
      >
        <div className='flex items-start justify-between gap-2.5'>
          <div className='flex items-center gap-2.5'>
            {item.externalArtistImageUrl ? (
              <div className='relative h-10 w-10 shrink-0 overflow-hidden rounded-full border border-subtle bg-(--linear-bg-surface-0)'>
                <Image
                  src={item.externalArtistImageUrl}
                  alt={item.externalArtistName ?? label}
                  fill
                  sizes='40px'
                  className='object-cover'
                  unoptimized={isExternalDspImage(item.externalArtistImageUrl)}
                />
              </div>
            ) : (
              <div className='flex h-10 w-10 items-center justify-center rounded-full border border-subtle bg-(--linear-bg-surface-0)'>
                <DspProviderIcon provider={item.providerId} size='lg' />
              </div>
            )}

            <div className='min-w-0 flex-1'>
              <div className='flex items-center gap-2'>
                <span className='truncate text-[13px] font-[520] tracking-[-0.01em] text-primary-token'>
                  {item.externalArtistName ?? 'Unknown Artist'}
                </span>
              </div>
              <div className='mt-0.5 flex items-center gap-1.5 text-[11px] text-tertiary-token'>
                <DspProviderIcon provider={item.providerId} size='sm' />
                <span>{label}</span>
              </div>
            </div>
          </div>

          <div className='shrink-0'>
            <MatchStatusBadge status={item.status} size='sm' />
          </div>
        </div>

        <div className='flex min-h-5 items-center gap-2.5 text-[12px] text-tertiary-token'>
          {isConfirmed && (
            <ConfidenceBadge score={item.confidenceScore} size='sm' />
          )}
          {item.matchingIsrcCount > 0 && (
            <span>{item.matchingIsrcCount} ISRC matches</span>
          )}
        </div>
      </button>

      {item.externalArtistUrl && (
        <div className='border-t border-subtle pt-2.5'>
          <a
            href={item.externalArtistUrl}
            target='_blank'
            rel='noopener noreferrer'
            className='inline-flex items-center gap-1.5 text-[12px] text-tertiary-token transition-colors hover:text-primary-token'
          >
            <Icon name='ExternalLink' className='h-3.5 w-3.5' />
            <span>View on {label}</span>
          </a>
        </div>
      )}
    </ContentSurfaceCard>
  );
}
