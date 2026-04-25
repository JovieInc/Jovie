'use client';

import Link from 'next/link';
import { type CSSProperties, useEffect, useState } from 'react';
import { BrandLogo } from '@/components/atoms/BrandLogo';
import { ProfileNotificationsContext } from '@/components/organisms/profile-shell/ProfileNotificationsContext';
import { useProfileShell } from '@/components/organisms/profile-shell/useProfileShell';
import { BASE_URL } from '@/constants/app';
import { ArtistNotificationsCTA } from '@/features/profile/artist-notifications-cta/ArtistNotificationsCTA';
import {
  buildProfileAccentCssVars,
  readProfileAccentTheme,
} from '@/lib/profile/profile-theme';
import type { Artist } from '@/types/db';

interface Props {
  readonly artist: Artist;
}

export function NotificationsPageClient({ artist }: Props) {
  const [notificationsPortalContainer, setNotificationsPortalContainer] =
    useState<HTMLDivElement | null>(null);
  const [isDesktopLayout, setIsDesktopLayout] = useState(false);
  const { notificationsContextValue } = useProfileShell({
    artist,
    socialLinks: [],
    contacts: [],
    smsEnabled: false,
  });
  const accentStyle = buildProfileAccentCssVars(
    readProfileAccentTheme(artist.theme)
  ) as CSSProperties;

  useEffect(() => {
    if (globalThis.window === undefined) {
      return;
    }

    const desktopQuery = globalThis.matchMedia('(min-width: 1180px)');
    const syncDesktop = () => setIsDesktopLayout(desktopQuery.matches);
    syncDesktop();

    if (typeof desktopQuery.addEventListener === 'function') {
      desktopQuery.addEventListener('change', syncDesktop);
      return () => desktopQuery.removeEventListener('change', syncDesktop);
    }

    desktopQuery.addListener(syncDesktop);
    return () => desktopQuery.removeListener(syncDesktop);
  }, []);

  return (
    <ProfileNotificationsContext.Provider value={notificationsContextValue}>
      <div
        className='relative flex h-[100dvh] items-center justify-center overflow-hidden bg-[color:var(--profile-stage-bg)] p-4 sm:p-6'
        data-testid='notifications-page'
        style={accentStyle}
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
        <div
          ref={setNotificationsPortalContainer}
          className={`relative z-10 flex w-full flex-col overflow-hidden border border-[color:var(--profile-panel-border)] bg-[var(--profile-content-bg)] shadow-[var(--profile-panel-shadow)] backdrop-blur-2xl ${
            isDesktopLayout
              ? 'h-[min(940px,calc(100dvh-48px))] max-w-[1540px] rounded-[36px] p-8'
              : 'h-[calc(100dvh-2rem)] max-w-sm rounded-[32px] p-5 sm:h-[min(844px,calc(100dvh-48px))] sm:p-6'
          }`}
        >
          <div className='mb-5 flex items-center justify-between'>
            <Link
              href={BASE_URL}
              aria-label='Jovie home'
              className='rounded-full opacity-60 transition-opacity duration-150 hover:opacity-85 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgb(var(--focus-ring))] focus-visible:ring-offset-2 focus-visible:ring-offset-transparent'
            >
              <BrandLogo
                size={20}
                tone='auto'
                rounded={false}
                className='block'
                aria-hidden={true}
              />
            </Link>
            <p className='text-xs font-semibold tracking-[-0.012em] text-primary-token/52'>
              Alerts for {artist.name}
            </p>
          </div>
          <h1 className='sr-only'>Manage Alerts for {artist.name}</h1>
          <ArtistNotificationsCTA
            artist={artist}
            presentation={isDesktopLayout ? 'modal' : 'overlay'}
            portalContainer={notificationsPortalContainer}
            variant='button'
            autoOpen
            forceExpanded
            hideTrigger
          />
        </div>
      </div>
    </ProfileNotificationsContext.Provider>
  );
}
