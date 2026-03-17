'use client';

import { TwoStepNotificationsCTA } from '@/features/profile/artist-notifications-cta/TwoStepNotificationsCTA';
import type { Artist } from '@/types/db';

interface Props {
  readonly artist: Artist;
}

export function NotificationsPageClient({ artist }: Props) {
  return (
    <div className='flex flex-col items-center justify-center min-h-[60vh] px-4'>
      <div className='w-full max-w-sm'>
        <TwoStepNotificationsCTA artist={artist} />
      </div>
    </div>
  );
}
