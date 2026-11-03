'use client';

import { Button, Skeleton } from '@jovie/ui';
import { ExternalLink, PanelRight } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { usePreviewPanelState } from '@/app/app/(shell)/dashboard/PreviewPanelContext';
import { SettingsPanel } from '@/components/molecules/settings/SettingsPanel';
import { ArtistProfileRailToggle } from '@/components/shell/ArtistProfileRailToggle';
import { SettingsSection } from '@/features/dashboard/organisms/SettingsSection';
import { SettingsProfileSection } from '@/features/dashboard/organisms/settings-profile-section';
import { useSettingsContext } from '@/features/dashboard/organisms/useSettingsContext';

function MobileProfilePanelTrigger() {
  const { isOpen, open } = usePreviewPanelState();

  return (
    <Button
      onClick={open}
      aria-label='Open Links And Music Preview Panel'
      aria-controls='shell-artist-profile-rail'
      aria-expanded={isOpen}
      data-rail-toggle='right'
      data-rail-preview-trigger='false'
      variant='secondary'
      className='h-auto min-h-16 w-full justify-between px-3 py-3 text-left lg:hidden'
    >
      <div>
        <p className='text-sm font-caption text-primary-token'>
          Links, music &amp; more
        </p>
        <p className='mt-0.5 text-app text-secondary-token'>
          Manage social links, music, tips, and about info
        </p>
      </div>
      <PanelRight
        className='h-4 w-4 shrink-0 text-tertiary-token'
        aria-hidden='true'
      />
    </Button>
  );
}

/**
 * Reserve the automatic companion from the server paint, then follow the
 * actual rail state. A manual close must reclaim the settings pane instead
 * of leaving an empty reservation. Artist/data reloads keep this lifecycle.
 * Transient previews never change the pane or its control's hit target.
 */
function CompanionRailReservation() {
  const { isPinned } = usePreviewPanelState();
  const [hasPinned, setHasPinned] = useState(false);
  useEffect(() => {
    if (isPinned) setHasPinned(true);
  }, [isPinned]);

  return (
    <span
      hidden
      data-settings-companion-rail={isPinned || !hasPinned ? 'true' : undefined}
    />
  );
}

export function ArtistProfileContent() {
  const router = useRouter();
  const { artist, setArtist, avatarQuality } = useSettingsContext();

  if (!artist) {
    return (
      <>
        <CompanionRailReservation />
        <SettingsSection
          id='artist-profile'
          title='Profile'
          description='Photo, name, username, and brand details shown on your public profile.'
        >
          <div
            className='space-y-4'
            role='status'
            aria-label='Loading Profile Settings'
          >
            <SettingsPanel
              title='Identity'
              description='Display name, username, image, and place details fans see.'
              bodyClassName='space-y-4 px-4 py-4 sm:px-5'
            >
              <Skeleton className='h-12 w-12' rounded='full' />
              {[0, 1, 2, 3, 4, 5].map(index => (
                <Skeleton key={index} className='h-10 w-full' rounded='lg' />
              ))}
            </SettingsPanel>
          </div>
        </SettingsSection>
        <Skeleton
          className='min-h-16 w-full lg:hidden'
          rounded='lg'
          data-testid='mobile-profile-trigger-skeleton'
        />
      </>
    );
  }

  return (
    <>
      <CompanionRailReservation />
      <SettingsSection
        id='artist-profile'
        title='Profile'
        description='Photo, name, username, and brand details shown on your public profile.'
        headerAction={
          <div className='flex shrink-0 items-center gap-2'>
            {artist.handle ? (
              <Button asChild variant='secondary' size='sm'>
                <a
                  href={`/${artist.handle}`}
                  target='_blank'
                  rel='noopener noreferrer'
                >
                  View as Visitor
                  <ExternalLink className='h-3.5 w-3.5' aria-hidden='true' />
                </a>
              </Button>
            ) : null}
            <span className='hidden lg:inline-flex'>
              <ArtistProfileRailToggle previewTrigger={false} />
            </span>
          </div>
        }
      >
        <div className='space-y-4'>
          <SettingsProfileSection
            artist={artist}
            avatarQuality={avatarQuality}
            onArtistUpdate={setArtist}
            onRefresh={() => router.refresh()}
          />
        </div>
      </SettingsSection>
      <MobileProfilePanelTrigger />
    </>
  );
}
