'use client';

import { Button, Skeleton } from '@jovie/ui';
import { ExternalLink, PanelRight } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { usePreviewPanelState } from '@/app/app/(shell)/dashboard/PreviewPanelContext';
import { SettingsPanel } from '@/components/molecules/settings/SettingsPanel';
import { SettingsPaySection } from '@/features/dashboard/organisms/SettingsPaySection';
import { SettingsSection } from '@/features/dashboard/organisms/SettingsSection';
import { SettingsProfileSection } from '@/features/dashboard/organisms/settings-profile-section';
import {
  ShopifyStoreCard,
  ShopifyStoreCardSkeleton,
} from '@/features/dashboard/organisms/shopify/ShopifyStoreCard';
import { useSettingsContext } from '@/features/dashboard/organisms/useSettingsContext';

function MobileProfilePanelTrigger() {
  const { open } = usePreviewPanelState();

  return (
    <Button
      onClick={open}
      aria-label='Open Links And Music Preview Panel'
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

export function ArtistProfileContent() {
  const router = useRouter();
  const { artist, setArtist, avatarQuality } = useSettingsContext();

  if (!artist) {
    return (
      <>
        <SettingsSection
          id='artist-profile'
          title='Artist'
          description='Photo, name, username, and brand details fans see.'
        >
          <div
            className='space-y-4'
            role='status'
            aria-label='Loading Artist Profile Settings'
          >
            <SettingsPanel
              title='Profile'
              description='Display name, username, image, and place details fans see.'
              bodyClassName='space-y-4 px-4 py-4 sm:px-5'
            >
              <Skeleton className='h-12 w-12' rounded='full' />
              {[0, 1, 2, 3, 4, 5].map(index => (
                <Skeleton key={index} className='h-10 w-full' rounded='lg' />
              ))}
            </SettingsPanel>
            <SettingsPanel
              title='Payments'
              description='Let fans support you directly from your profile.'
              bodyClassName='space-y-3 px-4 py-4 sm:px-5'
            >
              <Skeleton className='h-6 w-28' rounded='full' />
              <Skeleton className='h-4 w-full' rounded='md' />
              <Skeleton className='h-4 w-3/4' rounded='md' />
              <Skeleton className='h-8 w-60' rounded='lg' />
            </SettingsPanel>
            <ShopifyStoreCardSkeleton />
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
      <SettingsSection
        id='artist-profile'
        title='Artist'
        description='Photo, name, username, and brand details fans see.'
        headerAction={
          artist.handle ? (
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
