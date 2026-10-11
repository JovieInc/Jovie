'use client';

import { ProfileInlineNotificationsCTA } from '@/features/profile/artist-notifications-cta';
import type { Artist } from '@/types/db';
import { ReleaseCountdown } from './ReleaseCountdown';

interface PreSaveActionsProps {
  readonly releaseDate: Date;
  readonly artistData: Artist;
}

export function PreSaveActions({
  releaseDate,
  artistData,
}: PreSaveActionsProps) {
  return (
    <div className='space-y-3'>
      {/* Countdown */}
      <div
        className='flex w-full items-center justify-center rounded-xl border border-white/[0.08] bg-white/[0.05] px-4 py-3 backdrop-blur-2xl'
        data-testid='release-countdown'
      >
        <ReleaseCountdown releaseDate={releaseDate} compact />
      </div>

      {/* Inline notification signup — same component as artist profiles */}
      <ProfileInlineNotificationsCTA artist={artistData} />
    </div>
  );
}
