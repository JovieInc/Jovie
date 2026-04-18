'use client';

import { formatReleaseDate } from './utils';

const RELEASE_TYPE_LABELS: Record<string, string> = {
  single: 'Single',
  ep: 'EP',
  album: 'Album',
  compilation: 'Compilation',
  live: 'Live',
  mixtape: 'Mixtape',
  other: 'Other',
};

interface ReleaseFieldsProps {
  readonly releaseDate: string | undefined;
  readonly revealDate?: string;
  readonly releaseType?: string;
  readonly totalTracks?: number;
  readonly platformCount?: number;
}

export function ReleaseFields({
  releaseDate,
  revealDate,
  releaseType,
  totalTracks,
  platformCount,
}: ReleaseFieldsProps) {
  const parts: string[] = [];
  if (releaseType) {
    parts.push(RELEASE_TYPE_LABELS[releaseType] ?? releaseType);
  }
  if (totalTracks != null && totalTracks > 0) {
    parts.push(`${totalTracks} ${totalTracks === 1 ? 'track' : 'tracks'}`);
  }
  if (platformCount != null && platformCount > 0) {
    parts.push(`${platformCount} ${platformCount === 1 ? 'DSP' : 'DSPs'}`);
  }

  return (
    <div className='space-y-0.5'>
      <p className='text-[11.5px] leading-[15px] text-secondary-token'>
        {releaseDate ? (
          <>
            <span className='font-[500] text-quaternary-token'>Released</span>{' '}
            {formatReleaseDate(releaseDate)}
          </>
        ) : (
          <span className='text-tertiary-token'>No release date</span>
        )}
      </p>
      {revealDate && (
        <p className='text-[10.5px] leading-[14px] text-quaternary-token'>
          <span className='font-[500]'>Reveals</span>{' '}
          {formatReleaseDate(revealDate)}
        </p>
      )}
      {parts.length > 0 && (
        <p className='text-[10.5px] leading-[14px] tracking-[0.01em] text-quaternary-token'>
          {parts.join(' · ')}
        </p>
      )}
    </div>
  );
}
