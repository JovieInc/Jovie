'use client';

import { ProfileNotificationsContext } from '@/components/organisms/profile-shell/ProfileNotificationsContext';
import { useProfileShell } from '@/components/organisms/profile-shell/useProfileShell';
import { TwoStepNotificationsCTA } from '@/features/profile/artist-notifications-cta/TwoStepNotificationsCTA';
import type { Artist } from '@/types/db';

interface Props {
  readonly artist: Artist;
}

export function NotificationsPageClient({ artist }: Props) {
  const { notificationsContextValue } = useProfileShell({
    artist,
    socialLinks: [],
    contacts: [],
    smsEnabled: false,
  });

  return (
    <ProfileNotificationsContext.Provider value={notificationsContextValue}>
      <div
        className='relative flex min-h-[calc(100dvh-7rem)] items-start justify-center overflow-hidden bg-[color:var(--profile-stage-bg)] px-4 pb-10 pt-10 sm:pt-14'
        data-testid='notifications-page'
      >
        <div
          className='pointer-events-none absolute inset-0 bg-[var(--profile-stage-overlay)]'
          aria-hidden='true'
        />
        <div
          className='pointer-events-none absolute left-[12%] top-[10%] h-56 w-56 rounded-full bg-[color:var(--profile-stage-glow-a)] blur-3xl sm:h-72 sm:w-72'
          aria-hidden='true'
        />
        <div
          className='pointer-events-none absolute bottom-[12%] right-[10%] h-52 w-52 rounded-full bg-[color:var(--profile-stage-glow-b)] blur-3xl sm:h-64 sm:w-64'
          aria-hidden='true'
        />
        <div className='relative z-10 w-full max-w-sm rounded-[32px] border border-[color:var(--profile-panel-border)] bg-[var(--profile-content-bg)] p-5 shadow-[var(--profile-panel-shadow)] backdrop-blur-2xl sm:p-6'>
          <TwoStepNotificationsCTA artist={artist} startExpanded />
        </div>
      </div>
    </ProfileNotificationsContext.Provider>
  );
}
