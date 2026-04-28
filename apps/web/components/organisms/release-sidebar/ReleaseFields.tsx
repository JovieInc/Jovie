'use client';

import { DropDateChip } from '@/components/shell/DropDateChip';
import { MetaPill } from '@/components/shell/MetaPill';
import { TypeBadge } from '@/components/shell/TypeBadge';
import { dropDateMeta } from '@/lib/format-drop-date';
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
  const releaseTypeLabel = releaseType
    ? (RELEASE_TYPE_LABELS[releaseType] ?? releaseType)
    : null;
  const trackLabel =
    totalTracks != null && totalTracks > 0
      ? `${totalTracks} ${totalTracks === 1 ? 'Track' : 'Tracks'}`
      : null;
  const platformLabel =
    platformCount != null && platformCount > 0
      ? `${platformCount} ${platformCount === 1 ? 'DSP' : 'DSPs'}`
      : null;
  const dropDate = releaseDate ? dropDateMeta(releaseDate) : null;

  return (
    <div className='space-y-1.5'>
      <div className='flex flex-wrap items-center gap-1.5'>
        {releaseTypeLabel ? <TypeBadge label={releaseTypeLabel} /> : null}
        {dropDate ? (
          <DropDateChip tone={dropDate.tone} label={dropDate.label} />
        ) : (
          <MetaPill>No Release Date</MetaPill>
        )}
      </div>
      {revealDate && (
        <p className='text-[10.5px] leading-[14px] text-quaternary-token'>
          <span className='font-[500]'>Reveals</span>{' '}
          {formatReleaseDate(revealDate)}
        </p>
      )}
      <div className='flex flex-wrap items-center gap-1'>
        {trackLabel ? <MetaPill>{trackLabel}</MetaPill> : null}
        {platformLabel ? <MetaPill>{platformLabel}</MetaPill> : null}
      </div>
    </div>
  );
}
