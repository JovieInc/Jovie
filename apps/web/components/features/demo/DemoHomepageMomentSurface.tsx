'use client';

import { useSearchParams } from 'next/navigation';
import { ReleaseLandingPage } from '@/app/r/[slug]/ReleaseLandingPage';
import { AudiencePanelProvider } from '@/features/dashboard/organisms/AudiencePanelContext';
import { DashboardAudienceWorkspace } from '@/features/dashboard/organisms/DashboardAudienceWorkspace';
import {
  type AudienceActionAdapter,
  DEFAULT_AUDIENCE_FILTERS,
} from '@/features/dashboard/organisms/dashboard-audience-table';
import { HOMEPAGE_PROFILE_PREVIEW_ARTIST } from '@/features/home/homepage-profile-preview-fixture';
import { ArtistNotificationsCTA } from '@/features/profile/artist-notifications-cta';
import { ReleaseNotificationsProvider } from '@/features/release/ReleaseNotificationsProvider';
import { DemoAuthShell } from './DemoAuthShell';
import { DemoClientProviders } from './DemoClientProviders';
import { DemoReleasesExperience } from './DemoReleasesExperience';
import {
  HOMEPAGE_MOMENT_IDS,
  HOMEPAGE_MOMENT_PROVIDERS,
  HOMEPAGE_MOMENT_RELEASE,
  HOMEPAGE_MOMENT_SUBSCRIBERS,
  type HomepageMomentId,
} from './homepage-moment-fixtures';

/**
 * Homepage product moments (lib/screenshots/product-shots.ts `home-*`).
 * Each `?moment=` renders one real product component with Tim White canary
 * data (his real releases and handle) so the homepage shot is a crop of the
 * shipped UI, not a mockup:
 *
 * - smart-link: the release smart link (`ReleaseLandingPage`).
 * - capture: the Get Updates email step (`ArtistNotificationsCTA`).
 * - email: rendered server-side by `DemoHomepageEmailMoment`.
 * - list: the subscribers table (`DashboardAudienceWorkspace`).
 * - catalog: Tim White's imported catalog, a smart link per release
 *   (`DemoReleasesExperience`, founder fixture).
 */

function isHomepageMomentId(value: string | null): value is HomepageMomentId {
  return HOMEPAGE_MOMENT_IDS.includes(value as HomepageMomentId);
}

/** A static capture: row actions are not part of the moment. */
const STATIC_ACTIONS: AudienceActionAdapter = {};

function SmartLinkMoment() {
  return (
    <div
      className='mx-auto w-full max-w-[26rem]'
      data-testid='homepage-moment-smart-link'
    >
      <ReleaseLandingPage
        release={{
          title: HOMEPAGE_MOMENT_RELEASE.title,
          artworkUrl: HOMEPAGE_MOMENT_RELEASE.artworkUrl,
          releaseDate: null,
        }}
        artist={{
          name: HOMEPAGE_PROFILE_PREVIEW_ARTIST.name,
          handle: HOMEPAGE_PROFILE_PREVIEW_ARTIST.handle,
          avatarUrl: null,
        }}
        providers={[...HOMEPAGE_MOMENT_PROVIDERS]}
        initialMenuOpen={false}
      />
    </div>
  );
}

function CaptureMoment() {
  return (
    <div className='flex min-h-screen items-center justify-center bg-base px-6'>
      <div
        className='w-full max-w-[22rem]'
        data-testid='homepage-moment-capture'
      >
        <ReleaseNotificationsProvider artist={HOMEPAGE_PROFILE_PREVIEW_ARTIST}>
          <ArtistNotificationsCTA
            artist={HOMEPAGE_PROFILE_PREVIEW_ARTIST}
            variant='button'
            forceExpanded
            source='profile_inline'
          />
        </ReleaseNotificationsProvider>
      </div>
    </div>
  );
}

function ListMoment() {
  const rows = HOMEPAGE_MOMENT_SUBSCRIBERS;
  return (
    <DemoAuthShell>
      <AudiencePanelProvider initialMode={null}>
        {/* A fixed column so the crop reads at marketing scale, not 1440 wide. */}
        <div
          data-testid='homepage-moment-list'
          className='h-[30rem] w-[46rem] max-w-full'
        >
          <DashboardAudienceWorkspace
            mode='subscribers'
            view='all'
            rows={[...rows]}
            total={rows.length}
            sort='lastSeen'
            direction='desc'
            onSortChange={() => {}}
            onViewChange={() => {}}
            onFiltersChange={() => {}}
            profileUrl={`https://jov.ie/${HOMEPAGE_PROFILE_PREVIEW_ARTIST.handle}`}
            profileId='homepage-moment-profile'
            subscriberCount={rows.length}
            totalAudienceCount={rows.length}
            filters={DEFAULT_AUDIENCE_FILTERS}
            actionAdapter={STATIC_ACTIONS}
            analyticsMode='static'
            testId='homepage-moment-list-table'
          />
        </div>
      </AudiencePanelProvider>
    </DemoAuthShell>
  );
}

export function DemoHomepageMomentSurface() {
  const searchParams = useSearchParams();
  const requested = searchParams.get('moment');
  const moment: HomepageMomentId = isHomepageMomentId(requested)
    ? requested
    : 'smart-link';

  if (moment === 'list') return <ListMoment />;
  if (moment === 'catalog') {
    return (
      <div data-testid='homepage-moment-catalog'>
        <DemoReleasesExperience
          variant='founder'
          excludeReleaseTypes={['music_video']}
        />
      </div>
    );
  }

  return (
    <DemoClientProviders>
      <div className='min-h-screen bg-base'>
        {moment === 'smart-link' ? <SmartLinkMoment /> : null}
        {moment === 'capture' ? <CaptureMoment /> : null}
      </div>
    </DemoClientProviders>
  );
}
