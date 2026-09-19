'use client';

import {
  type PresenceOutcomeGroup,
  summarizePresenceOutcomes,
} from '@/lib/profile-surfaces/presence-identity';
import { cn } from '@/lib/utils';
import type { ProfilesWorkspaceData, ProfilesWorkspaceFilter } from './data';

export function PresenceOutcomeStrip({
  data,
  onSelectGroup,
}: Readonly<{
  data: ProfilesWorkspaceData;
  onSelectGroup?: (group: Exclude<PresenceOutcomeGroup, 'connector'>) => void;
}>) {
  const outcomes = summarizePresenceOutcomes({
    artistName: data.artist.name,
    artistIsPublic: data.artist.isPublic,
    providerAvailable: data.providerAvailable,
    bestJovieRank: data.bestJovieRank,
    lastObservedAt: data.lastObservedAt,
    rows: data.rows,
  });

  return (
    <section
      aria-label='Artist Presence Outcomes'
      data-testid='presence-outcomes'
      className='shrink-0 border-b border-subtle'
    >
      <div className='grid grid-cols-2 lg:grid-cols-4'>
        {outcomes.map(outcome => {
          const className = 'min-h-16 px-3 py-2 text-left';
          const content = (
            <>
              <span className='block text-2xs font-medium text-tertiary-token'>
                {outcome.label}
              </span>
              <span className='mt-1 block text-xs font-medium text-primary-token'>
                {outcome.value}
              </span>
              <span className='mt-1 block text-2xs leading-4 text-tertiary-token'>
                {outcome.detail}
              </span>
            </>
          );

          if (outcome.group === 'search') {
            return (
              <div key={outcome.group} className={className}>
                {content}
              </div>
            );
          }
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
    </section>
  );
}

export function presenceFilterForGroup(
  group: Exclude<PresenceOutcomeGroup, 'connector'>
): ProfilesWorkspaceFilter {
  if (group === 'search') return 'all';
  return group;
}
