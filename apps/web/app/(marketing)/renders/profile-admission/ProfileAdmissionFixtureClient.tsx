'use client';

import { CookieBannerSection } from '@/components/organisms/CookieBannerSection';
import { QueryProvider } from '@/components/providers/QueryProvider';
import { PublicProfileFixture } from '@/features/profile/PublicProfileFixture';
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

export function ProfileAdmissionFixtureClient({
  params,
}: Readonly<{ params: Record<string, string | string[] | undefined> }>) {
  const searchParams = {
    get: (key: string) => {
      const value = params[key];
      return Array.isArray(value) ? value[0] : value;
    },
  };

  if (searchParams.get('violation') === 'phantom-banner') {
    return (
      <div
        data-testid='public-profile-layout-shell'
        data-layout='desktop'
        style={{ width: '100%' }}
      >
        <div
          data-testid='profile-desktop-shell'
          style={{ height: 600, width: '100%' }}
        >
          <div
            data-testid='profile-desktop-banner'
            style={{ display: 'block', height: 68 }}
          />
          <div data-testid='profile-desktop-surface' style={{ height: 532 }} />
        </div>
      </div>
    );
  }

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
            state={searchParams.get('state')}
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
