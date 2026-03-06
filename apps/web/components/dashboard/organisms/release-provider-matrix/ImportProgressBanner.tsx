'use client';

import { memo } from 'react';
import { SocialIcon } from '@/components/atoms/SocialIcon';

interface ImportProgressBannerProps {
  readonly artistName: string | null;
  readonly importedCount: number;
}

export const ImportProgressBanner = memo(function ImportProgressBanner({
  artistName,
  importedCount,
}: ImportProgressBannerProps) {
  return (
    <div
      className='mx-4 mt-2 flex items-center gap-3 rounded-lg border border-[#1DB954]/20 bg-[#1DB954]/5 px-4 py-3'
      aria-live='polite'
    >
      <SocialIcon platform='spotify' className='h-5 w-5 shrink-0' />
      <div className='flex min-w-0 flex-1 flex-col gap-1'>
        <div className='flex items-center gap-2 text-sm text-primary-token'>
          <span className='truncate'>
            {artistName
              ? `Importing releases from ${artistName}...`
              : 'Importing releases from Spotify...'}
          </span>
          <span className='shrink-0 text-xs text-secondary-token'>
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
