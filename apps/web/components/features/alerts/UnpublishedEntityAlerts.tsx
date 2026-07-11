'use client';

import Link from 'next/link';
import { AlertGrowthLanding } from '@/components/features/alerts/AlertGrowthLanding';
import type { Artist } from '@/types/db';

export interface UnpublishedEntityAlertsProps {
  readonly artist: Artist;
  /** Optional release/entity title for copy; never required. */
  readonly entityTitle?: string | null;
}

/**
 * Public-facing opt-in when a real entity exists but is not live yet.
 * Reuses the alerts capture surface so fan intent is owned (JOV-3682).
 */
export function UnpublishedEntityAlerts({
  artist,
  entityTitle,
}: UnpublishedEntityAlertsProps) {
  const artistName = artist.name?.trim() || artist.handle;
  const profileHref = `/${encodeURIComponent(artist.handle.trim().toLowerCase())}`;

  return (
    <div data-testid='unpublished-entity-alerts'>
      <div className='mx-auto max-w-108 px-5 pt-8 sm:pt-10'>
        <p className='text-secondary-token text-sm leading-6'>
          Looks like this is still in the works from{' '}
          <Link
            href={profileHref}
            className='text-primary-token font-medium underline-offset-4 hover:underline'
          >
            {artistName}
          </Link>
          {entityTitle ? (
            <>
              {' '}
              — <span className='text-primary-token'>{entityTitle}</span>
            </>
          ) : null}
          . Want alerts the moment it drops?
        </p>
      </div>
      <AlertGrowthLanding artist={artist} exitHref={profileHref} />
    </div>
  );
}
