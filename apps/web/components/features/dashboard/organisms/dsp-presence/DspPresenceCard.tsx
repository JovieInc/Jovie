'use client';

import { ExternalLink } from 'lucide-react';
import Image from 'next/image';
import type { DspPresenceItem } from '@/app/app/(shell)/dashboard/presence/actions';
import { ContentSurfaceCard } from '@/components/molecules/ContentSurfaceCard';
import {
  DspProviderIcon,
  PROVIDER_COLORS,
  PROVIDER_LABELS,
} from '@/features/dashboard/atoms/DspProviderIcon';
import { MatchStatusBadge } from '@/features/dashboard/atoms/MatchStatusBadge';
import { cn } from '@/lib/utils';
import { isExternalDspImage } from '@/lib/utils/dsp-images';

interface DspPresenceCardProps {
  readonly item: DspPresenceItem;
  readonly isSelected: boolean;
  readonly onClick: () => void;
}

export function DspPresenceCard({
  item,
  isSelected,
  onClick,
}: DspPresenceCardProps) {
  const label = PROVIDER_LABELS[item.providerId];
  const isManual = item.confidenceScore === null;

  return (
    <ContentSurfaceCard
      className={cn(
        'transition-colors duration-150 border-l-[3px]',
        isSelected && 'ring-1 ring-[#7170ff]/50',
        'hover:bg-surface-1/50'
      )}
      style={{ borderLeftColor: PROVIDER_COLORS[item.providerId] }}
      data-testid={`presence-card-${item.matchId}`}
    >
      <button
        type='button'
        className='w-full p-3 text-left cursor-pointer'
        onClick={onClick}
        role='option'
        aria-selected={isSelected}
        tabIndex={0}
      >
        {/* Top row: avatar + name + external link */}
        <div className='flex items-center gap-2'>
          {item.externalArtistImageUrl ? (
            <div className='relative h-6 w-6 shrink-0 overflow-hidden rounded-full border border-subtle bg-surface-1'>
              <Image
                src={item.externalArtistImageUrl}
                alt={item.externalArtistName ?? label}
                fill
                sizes='24px'
                className='object-cover'
                unoptimized={isExternalDspImage(item.externalArtistImageUrl)}
              />
            </div>
          ) : (
            <div className='flex h-6 w-6 items-center justify-center rounded-full border border-subtle bg-surface-1'>
              <DspProviderIcon provider={item.providerId} size='sm' />
            </div>
          )}
          <span className='truncate font-[510] text-[13px] text-primary-token flex-1'>
            {item.externalArtistName ?? 'Unknown Artist'}
          </span>
          {item.externalArtistUrl && (
            <a
              href={item.externalArtistUrl}
              target='_blank'
              rel='noopener noreferrer'
              onClick={e => e.stopPropagation()}
              className='flex h-6 w-6 items-center justify-center rounded text-tertiary-token transition-colors hover:text-primary-token'
              aria-label={`View on ${label}`}
            >
              <ExternalLink className='h-3.5 w-3.5' />
            </a>
          )}
        </div>

        {/* Bottom row: provider + status */}
        <div className='flex items-center gap-1.5 mt-1.5'>
          <DspProviderIcon provider={item.providerId} size='sm' />
          <span className='text-[11px] text-tertiary-token'>{label}</span>
          <span className='flex-1' />
          {isManual ? (
            <span className='text-[11px] text-tertiary-token'>Manual</span>
          ) : (
            <MatchStatusBadge status={item.status} size='sm' />
          )}
        </div>
      </button>
    </ContentSurfaceCard>
  );
}
