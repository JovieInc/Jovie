'use client';

import { useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { CookieBannerSection } from '@/components/organisms/CookieBannerSection';
import { QueryProvider } from '@/components/providers/QueryProvider';
import {
  HOMEPAGE_PROFILE_PREVIEW_ARTIST,
  HOMEPAGE_PROFILE_PREVIEW_CONTACTS,
  HOMEPAGE_PROFILE_PREVIEW_DRAWER_RELEASES,
  HOMEPAGE_PROFILE_PREVIEW_RELEASES,
  HOMEPAGE_PROFILE_PREVIEW_SOCIAL_LINKS,
  HOMEPAGE_PROFILE_PREVIEW_TOUR_DATES,
} from '@/features/home/homepage-profile-preview-fixture';
import { ClaimBanner } from '@/features/profile/ClaimBanner';
import { ProfileCompactTemplate } from '@/features/profile/templates/ProfileCompactTemplate';
import { MarketingStateRenderClient } from '../[state]/MarketingStateRenderClient';

function DeliberateRedDesktopHybrid() {
  return (
    <div
      className='flex min-h-dvh w-full items-center justify-center bg-base'
      data-testid='public-profile-layout-shell'
      data-layout='desktop'
      data-interactive-ready='true'
    >
      <div
        className='flex h-185 w-107.5 max-w-full flex-col overflow-hidden bg-base'
        data-testid='profile-compact-shell'
      >
        <div className='flex items-center justify-between gap-2 px-3 py-2'>
          <p className='text-sm'>This profile is unclaimed.</p>
          <a
            href='https://example.com/claim/test'
            className='flex min-h-11 w-16 items-center rounded-full px-2 text-xs'
            data-testid='claim-banner-cta'
          >
            <span data-testid='claim-banner-cta-label'>Verify &amp; Claim</span>
          </a>
        </div>
        <div className='flex-1' />
        <nav
          className='flex min-h-11 items-center justify-around'
          data-testid='profile-bottom-nav'
          aria-label='Profile Navigation'
        >
          <a href='https://example.com/fixture'>Home</a>
          <a href='https://example.com/fixture?mode=listen'>Music</a>
        </nav>
      </div>
    </div>
  );
}

function PublicProfileFixture({
  longName,
  preview = false,
}: Readonly<{ longName: boolean; preview?: boolean }>) {
  const artist = {
    ...HOMEPAGE_PROFILE_PREVIEW_ARTIST,
    id: '123e4567-e89b-12d3-a456-426614174000',
    name: longName ? 'The Extraordinary Midnight Radio Orchestra' : 'Unfazed',
    handle: 'unfazed',
  };

  return (
    <ProfileCompactTemplate
      mode='profile'
      artist={artist}
      socialLinks={[...HOMEPAGE_PROFILE_PREVIEW_SOCIAL_LINKS]}
      contacts={[...HOMEPAGE_PROFILE_PREVIEW_CONTACTS]}
      allowFanCapture={false}
      latestRelease={HOMEPAGE_PROFILE_PREVIEW_RELEASES.live}
      profileSettings={{ showOldReleases: true }}
      genres={artist.genres ?? []}
      photoDownloadSizes={[]}
      pressPhotos={[]}
      allowPhotoDownloads={false}
      tourDates={[...HOMEPAGE_PROFILE_PREVIEW_TOUR_DATES]}
      releases={[...HOMEPAGE_PROFILE_PREVIEW_DRAWER_RELEASES]}
      profileBanner={
        <ClaimBanner
          profileHandle={artist.handle}
          displayName={artist.name}
          ctaHref={`/${artist.handle}/claim?next=auth`}
          variant='verified_claim'
        />
      }
      embeddedPreview={preview}
    />
  );
}

export function ProfileAdmissionFixtureClient() {
  const searchParams = useSearchParams();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  if (!mounted) return null;

  if (searchParams.get('violation') === 'desktop-compact-shell') {
    return <DeliberateRedDesktopHybrid />;
  }

  return (
    <QueryProvider>
      {['public', 'preview'].includes(searchParams.get('layout') ?? '') ? (
        <div className='h-dvh w-full' data-testid='marketing-render-surface'>
          <PublicProfileFixture
            longName={searchParams.get('name') === 'long'}
            preview={searchParams.get('layout') === 'preview'}
          />
        </div>
      ) : (
        <>
          <MarketingStateRenderClient stateId='mock-home' interactive />
          <CookieBannerSection testOnlyPathname='/profile-admission-fixture' />
        </>
      )}
    </QueryProvider>
  );
}
