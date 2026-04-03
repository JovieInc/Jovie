'use client';

import { ExternalLink, PanelRight } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { usePreviewPanelState } from '@/app/app/(shell)/dashboard/PreviewPanelContext';
import { SettingsErrorState } from '@/features/dashboard/molecules/SettingsErrorState';
import { SettingsAlbumArtBrandKitsSection } from '@/features/dashboard/organisms/SettingsAlbumArtBrandKitsSection';
import { SettingsBrandingSection } from '@/features/dashboard/organisms/SettingsBrandingSection';
import { SettingsSection } from '@/features/dashboard/organisms/SettingsSection';
import { SettingsTipsSection } from '@/features/dashboard/organisms/SettingsTipsSection';
import { SettingsProfileSection } from '@/features/dashboard/organisms/settings-profile-section';
import { ShopifyStoreCard } from '@/features/dashboard/organisms/shopify/ShopifyStoreCard';
import { useSettingsContext } from '@/features/dashboard/organisms/useSettingsContext';

function MobileProfilePanelTrigger() {
  const { open } = usePreviewPanelState();

  return (
    <button
      type='button'
      onClick={open}
      aria-label='Open links and music preview panel'
      className='flex w-full items-center justify-between rounded-[14px] border border-(--linear-app-frame-seam) bg-(--linear-app-content-surface) px-3 py-3 text-left transition-colors hover:bg-surface-0 active:bg-surface-1 lg:hidden'
    >
      <div>
        <p className='text-[14px] font-[510] text-primary-token'>
          Links, music &amp; more
        </p>
        <p className='mt-0.5 text-[13px] text-secondary-token'>
          Manage social links, music, tips, and about info
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
  const { artist, setArtist, isPro, avatarQuality } = useSettingsContext();

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
        description='Photo, name, username, and branding.'
        headerAction={
          artist.handle ? (
            <a
              href={`/${artist.handle}`}
              target='_blank'
              rel='noopener noreferrer'
              className='inline-flex items-center gap-1.5 rounded-full border border-(--linear-app-frame-seam) bg-(--linear-app-content-surface) px-3 py-1.5 text-[13px] font-[510] text-secondary-token transition-colors hover:bg-surface-0 hover:text-primary-token'
            >
              View as Visitor
              <ExternalLink className='h-3.5 w-3.5' aria-hidden='true' />
            </a>
          ) : null
        }
      >
        <div className='space-y-4'>
          <SettingsProfileSection
            artist={artist}
            avatarQuality={avatarQuality}
            onArtistUpdate={setArtist}
            onRefresh={() => router.refresh()}
          />
          <SettingsBrandingSection
            artist={artist}
            onArtistUpdate={setArtist}
            isPro={isPro}
          />
          <SettingsAlbumArtBrandKitsSection artist={artist} />
          <SettingsTipsSection />
          <ShopifyStoreCard />
        </div>
      </SettingsSection>
      <MobileProfilePanelTrigger />
    </>
  );
}
