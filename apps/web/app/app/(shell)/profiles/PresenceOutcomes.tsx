'use client';

import {
  getPresenceEntityName,
  getPresenceObservation,
  isPhotoStripRow,
  type PresenceIdentitySubject,
  type PresenceOutcomeGroup,
  summarizePresenceOutcomes,
} from '@/lib/profile-surfaces/presence-identity';
import { getConnectionPrimaryAction } from '@/lib/profile-surfaces/workspace';
import { cn } from '@/lib/utils';
import type {
  ProfilesWorkspaceData,
  ProfilesWorkspaceFilter,
  ProfileWorkspaceRow,
} from './data';
import { PresenceIdentityPhoto } from './PresenceIdentityPhoto';

export function PresenceOutcomeStrip({
  data,
  rows,
  onSelectGroup,
  onSelectRow,
}: Readonly<{
  data: ProfilesWorkspaceData;
  rows?: readonly ProfileWorkspaceRow[];
  onSelectGroup?: (group: Exclude<PresenceOutcomeGroup, 'connector'>) => void;
  onSelectRow?: (row: ProfileWorkspaceRow) => void;
}>) {
  const outcomes = summarizePresenceOutcomes({
    artistName: data.artist.name,
    artistIsPublic: data.artist.isPublic,
    providerAvailable: data.providerAvailable,
    bestJovieRank: data.bestJovieRank,
    lastObservedAt: data.lastObservedAt,
    rows: data.rows,
  });
  const photoRows = (rows ?? data.rows).filter(
    (row): row is ProfileWorkspaceRow & PresenceIdentitySubject =>
      isPhotoStripRow(row)
  );

  return (
    <section
      aria-label='Artist Presence Outcomes'
      data-testid='presence-outcomes'
      className='shrink-0 border-b border-subtle'
    >
      <div className='grid grid-cols-2 lg:grid-cols-4'>
        {outcomes.map(outcome => {
          const className =
            'min-h-22 border-b border-subtle px-3 py-3 text-left even:border-l lg:min-h-20 lg:border-b-0 lg:border-l lg:first:border-l-0';
          const content = (
            <>
              <span className='block text-2xs font-medium text-tertiary-token'>
                {outcome.label}
              </span>
              <span className='mt-1 block text-sm font-semibold text-primary-token'>
                {outcome.value}
              </span>
              <span className='mt-1 block text-2xs leading-4 text-tertiary-token'>
                {outcome.detail}
              </span>
            </>
          );

          return (
            <button
              key={outcome.group}
              type='button'
              aria-label={`${outcome.label} Outcome`}
              className={cn(
                className,
                'transition-colors duration-fast hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-focus/50'
              )}
              onClick={() => onSelectGroup?.(outcome.group)}
            >
              {content}
            </button>
          );
        })}
      </div>
      {photoRows.length > 0 ? (
        <div
          data-testid='presence-photo-strip'
          className='flex items-center gap-2 overflow-x-auto px-3 py-2'
        >
          <span className='sr-only'>Profile photos side by side</span>
          {photoRows.map(row => {
            const needsAttention =
              getPresenceObservation(row, {
                providerAvailable: data.providerAvailable,
              }).status !== 'measured' ||
              getConnectionPrimaryAction(row) !== 'open';
            return (
              <button
                key={row.id}
                type='button'
                className='relative shrink-0 rounded-full focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-focus/50'
                onClick={() => onSelectRow?.(row)}
                aria-label={`${getPresenceEntityName(row, data.artist.name)} on ${row.platform}${needsAttention ? ', needs attention' : ''}`}
              >
                <PresenceIdentityPhoto
                  subject={row}
                  artistName={data.artist.name}
                  size='lg'
                />
                {needsAttention ? (
                  <span
                    className='absolute -top-0.5 -left-0.5 h-2 w-2 rounded-full bg-warning'
                    aria-hidden
                  />
                ) : null}
              </button>
            );
          })}
        </div>
      ) : null}
    </section>
  );
}

export function presenceFilterForGroup(
  group: Exclude<PresenceOutcomeGroup, 'connector'>
): ProfilesWorkspaceFilter {
  if (group === 'search') return 'all';
  return group;
}
