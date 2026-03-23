'use client';

import { PanelRight } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { usePreviewPanelState } from '@/app/app/(shell)/dashboard/PreviewPanelContext';
import { SettingsErrorState } from '@/features/dashboard/molecules/SettingsErrorState';
import { SettingsBrandingSection } from '@/features/dashboard/organisms/SettingsBrandingSection';
import { SettingsSection } from '@/features/dashboard/organisms/SettingsSection';
import { SettingsArtistProfileSection } from '@/features/dashboard/organisms/settings-artist-profile-section';
import { useSettingsContext } from '@/features/dashboard/organisms/useSettingsContext';

function MobileProfilePanelTrigger() {
  const { open } = usePreviewPanelState();

  return (
    <button
      type='button'
      onClick={open}
      className='flex w-full items-center justify-between rounded-[14px] border border-(--linear-app-frame-seam) bg-[color-mix(in_oklab,var(--linear-app-content-surface)_96%,var(--linear-bg-surface-0))] px-3 py-3 text-left transition-colors hover:bg-surface-0 active:bg-surface-1 lg:hidden'
    >
      <div>
        <p className='text-[14px] font-[510] text-primary-token'>
          Links, music &amp; more
        </p>
        <p className='mt-0.5 text-[13px] text-secondary-token'>
          Manage social links, music, earnings, and about info
        </p>
      </div>
      <PanelRight
        className='h-4 w-4 shrink-0 text-tertiary-token'
        aria-hidden='true'
      />
    </button>
  );
}

export function ArtistProfileContent() {
  const router = useRouter();
  const { artist, setArtist, isPro } = useSettingsContext();

  if (!artist) {
    return (
      <SettingsErrorState message='Unable to load your profile settings. Please refresh the page.' />
    );
  }

  return (
    <>
      <SettingsSection
        id='artist-profile'
        title='Artist Profile'
        description='Photo, display name, username, and branding.'
      >
        <div className='space-y-4'>
          <SettingsArtistProfileSection
            artist={artist}
            onArtistUpdate={setArtist}
            onRefresh={() => router.refresh()}
          />
          <SettingsBrandingSection
            artist={artist}
            onArtistUpdate={setArtist}
            isPro={isPro}
          />
        </div>
      </SettingsSection>
      <MobileProfilePanelTrigger />
    </>
  );
}
