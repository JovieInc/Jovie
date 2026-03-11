'use client';

import { memo } from 'react';
import { ProviderIcon } from '@/components/atoms/ProviderIcon';

interface ImportProgressBannerProps {
  readonly artistName: string | null;
  readonly importedCount: number;
  readonly visible?: boolean;
  readonly compact?: boolean;
}

export const ImportProgressBanner = memo(function ImportProgressBanner({
  artistName,
  importedCount,
  visible = true,
  compact = false,
}: ImportProgressBannerProps) {
  if (compact) {
    return (
      <div
        className='inline-flex h-8 items-center gap-2 rounded-full border border-[#1DB954]/25 bg-[#1DB954]/10 px-3 text-[12px] text-primary-token'
        aria-live='polite'
      >
        <SocialIcon platform='spotify' className='h-3.5 w-3.5 shrink-0' />
        <span className='max-w-[180px] truncate text-secondary-token'>
          {artistName ? `Importing ${artistName}` : 'Importing from Spotify'}
        </span>
        <span className='shrink-0 text-tertiary-token'>· {importedCount}</span>
      </div>
    );
  }

  return (
    <div
      data-testid='spotify-import-progress-banner'
      className='mx-4 mt-2 flex items-center gap-3 rounded-lg border border-[#1DB954]/20 bg-[#1DB954]/5 px-4 py-3 transition-opacity duration-200'
      aria-hidden={!visible}
      aria-live={visible ? 'polite' : 'off'}
      inert={!visible}
      style={{
        visibility: visible ? 'visible' : 'hidden',
        opacity: visible ? 1 : 0,
        pointerEvents: visible ? 'auto' : 'none',
      }}
    >
      <ProviderIcon provider='spotify' className='h-5 w-5' />
      <div className='flex min-w-0 flex-1 flex-col gap-1'>
        <div className='flex items-center gap-2 text-[13px] text-primary-token'>
          <span className='truncate'>
            {artistName
              ? `Importing releases from ${artistName}...`
              : 'Importing releases from Spotify...'}
          </span>
          <span className='shrink-0 text-[11px] text-secondary-token'>
            {importedCount} imported
          </span>
        </div>
        <div className='h-1 overflow-hidden rounded-full bg-[#1DB954]/10'>
          <div className='h-full w-1/3 animate-[progress-indeterminate_1.5s_ease-in-out_infinite] rounded-full bg-[#1DB954]' />
        </div>
      </div>
    </div>
  );
});
