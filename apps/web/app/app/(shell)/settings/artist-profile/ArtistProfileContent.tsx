'use client';

import { ExternalLink, PanelRight } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { usePreviewPanelState } from '@/app/app/(shell)/dashboard/PreviewPanelContext';
import { ProfileSettingsLoading } from '@/components/molecules/SettingsLoadingSkeleton';
import { SettingsPaySection } from '@/features/dashboard/organisms/SettingsPaySection';
import { SettingsSection } from '@/features/dashboard/organisms/SettingsSection';
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
        <p className='text-[14px] font-caption text-primary-token'>
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
  const { artist, setArtist, avatarQuality } = useSettingsContext();

  if (!artist) {
    return <ProfileSettingsLoading />;
  }

  return (
    <>
      <SettingsSection
        id='artist-profile'
        title='Artist'
        description='Photo, name, username, and brand details fans see.'
        headerAction={
          artist.handle ? (
            <a
              href={`/${artist.handle}`}
              target='_blank'
              rel='noopener noreferrer'
              className='inline-flex h-8 items-center gap-1.5 rounded-[10px] border border-(--linear-app-frame-seam) bg-(--linear-app-content-surface) px-3 text-xs font-caption text-secondary-token transition-colors hover:bg-surface-0 hover:text-primary-token'
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
          <SettingsPaySection />
          <ShopifyStoreCard />
        </div>
      </SettingsSection>
      <MobileProfilePanelTrigger />
    </>
  );
}
