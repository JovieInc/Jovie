'use client';

import { ExternalLink } from 'lucide-react';
import Image from 'next/image';
import { useTheme } from 'next-themes';
import { useEffect, useMemo, useState } from 'react';
import type { DspPresenceItem } from '@/app/app/(shell)/dashboard/presence/actions';
import { ContentSurfaceCard } from '@/components/molecules/ContentSurfaceCard';
import {
  DspProviderIcon,
  PROVIDER_COLORS,
  PROVIDER_LABELS,
} from '@/features/dashboard/atoms/DspProviderIcon';
import { MatchStatusBadge } from '@/features/dashboard/atoms/MatchStatusBadge';
import { cn } from '@/lib/utils';
import { getContrastSafeIconColor } from '@/lib/utils/color';
import { isExternalDspImage } from '@/lib/utils/dsp-images';

interface DspPresenceCardProps {
  readonly item: DspPresenceItem;
  readonly isSelected: boolean;
  readonly onClick: () => void;
  readonly onKeyDown?: (e: React.KeyboardEvent<HTMLButtonElement>) => void;
}

export function DspPresenceCard({
  item,
  isSelected,
  onClick,
  onKeyDown,
}: DspPresenceCardProps) {
  const label = PROVIDER_LABELS[item.providerId];
  const isManual = item.matchSource === 'manual';

  // Match DspProviderIcon's contrast-safe color transform for dark mode
  const { resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);
  const isDark = mounted ? resolvedTheme === 'dark' : false;
  const borderColor = useMemo(
    () => getContrastSafeIconColor(PROVIDER_COLORS[item.providerId], isDark),
    [isDark, item.providerId]
  );

  return (
    <ContentSurfaceCard
      className={cn(
        'transition-colors duration-150 border-l-[3px]',
        isSelected && 'ring-1 ring-[#7170ff]/50',
        'hover:bg-surface-1/50'
      )}
      style={{ borderLeftColor: borderColor }}
      data-testid={`presence-card-${item.matchId}`}
    >
      <div className='flex items-center'>
        <button
          type='button'
          className='flex-1 p-3 text-left cursor-pointer min-w-0'
          onClick={onClick}
          onKeyDown={onKeyDown}
          aria-pressed={isSelected}
          tabIndex={0}
        >
          {/* Top row: avatar + name */}
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

        {/* External link as sibling, not nested inside the button */}
        {item.externalArtistUrl && (
          <a
            href={item.externalArtistUrl}
            target='_blank'
            rel='noopener noreferrer'
            className='flex h-6 w-6 shrink-0 items-center justify-center rounded text-tertiary-token transition-colors hover:text-primary-token mr-3'
            aria-label={`View on ${label}`}
          >
            <ExternalLink className='h-3.5 w-3.5' />
          </a>
        )}
      </div>
    </ContentSurfaceCard>
  );
}
