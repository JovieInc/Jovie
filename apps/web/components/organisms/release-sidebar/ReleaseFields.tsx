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
  readonly releaseType?: string;
  readonly totalTracks?: number;
  readonly platformCount?: number;
}

export function ReleaseFields({
  releaseDate,
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
    parts.push(
      `${platformCount} ${platformCount === 1 ? 'platform' : 'platforms'}`
    );
  }

  return (
    <div className='space-y-0.5'>
      <p className='text-[12px] leading-[16px] text-(--linear-text-secondary)'>
        {releaseDate ? (
          <>
            <span className='text-(--linear-text-tertiary)'>Released</span>{' '}
            {formatReleaseDate(releaseDate)}
          </>
        ) : (
          <span className='italic'>No release date</span>
        )}
      </p>
      {parts.length > 0 && (
        <p className='text-[11px] leading-[14px] text-(--linear-text-tertiary)'>
          {parts.join(' · ')}
        </p>
      )}
    </div>
  );
}
