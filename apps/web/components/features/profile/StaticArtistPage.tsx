import { Suspense } from 'react';
import type { TourDateViewModel } from '@/app/app/(shell)/dashboard/tour-dates/actions';
import { AboutSection } from '@/features/profile/AboutSection';
import {
  ArtistNotificationsCTA,
  TwoStepNotificationsCTA,
} from '@/features/profile/artist-notifications-cta';
import { ContactSection } from '@/features/profile/ContactSection';
import type {
  ProfileMode,
  ProfilePublicViewModel,
} from '@/features/profile/contracts';
import { LatestReleaseCard } from '@/features/profile/LatestReleaseCard';
import { ProfilePrimaryCTA } from '@/features/profile/ProfilePrimaryCTA';
import { StaticListenInterface } from '@/features/profile/StaticListenInterface';
import { SubscriptionConfirmedBanner } from '@/features/profile/SubscriptionConfirmedBanner';
import { TourModePanel } from '@/features/profile/TourModePanel';
import { PublicProfileTemplate } from '@/features/profile/templates/PublicProfileTemplate';
import { extractVenmoUsername } from '@/features/profile/utils/venmo';
import VenmoTipSelector from '@/features/profile/VenmoTipSelector';
import { buildProfilePublicViewModel } from '@/features/profile/view-models';
import type { DiscogRelease } from '@/lib/db/schema/content';
import type { AvailableDSP } from '@/lib/dsp';
import { getCanonicalProfileDSPs } from '@/lib/profile-dsps';
import type { AvatarSize } from '@/lib/utils/avatar-sizes';
import type { PublicContact } from '@/types/contacts';
import { Artist, LegacySocialLink } from '@/types/db';

const TIP_AMOUNTS = [3, 5, 7];

export interface StaticArtistPageProps {
  readonly mode: ProfileMode;
  readonly artist: Artist;
  readonly socialLinks: LegacySocialLink[];
  readonly contacts: PublicContact[];
  readonly subtitle: string;
  readonly showTipButton: boolean;
  readonly showBackButton: boolean;
  readonly showTourButton?: boolean;
  readonly showFooter?: boolean;
  readonly autoOpenCapture?: boolean;
  readonly enableDynamicEngagement?: boolean;
  readonly latestRelease?: DiscogRelease | null;
  /** Available download sizes for profile photo */
  readonly photoDownloadSizes?: AvatarSize[];
  /** Whether profile photo downloads are allowed */
  readonly allowPhotoDownloads?: boolean;
  /** Whether to show the two-step notification subscribe variant */
  readonly subscribeTwoStep?: boolean;
  /** Artist genres for the about section */
  readonly genres?: string[] | null;
  readonly tourDates?: TourDateViewModel[];
  /** HMAC-signed tracking token for authenticating visit tracking requests */
  readonly visitTrackingToken?: string;
  readonly showSubscriptionConfirmedBanner?: boolean;
  readonly showShopButton?: boolean;
}

/**
 * Merge artist-level DSPs with social-link-derived DSPs, deduped by key.
 * Artist DSPs take priority (listed first).
 */
function getMergedDSPs(artist: Artist) {
  return getCanonicalProfileDSPs(artist);
}

interface RenderContentOptions {
  readonly viewModel: ProfilePublicViewModel;
  readonly mergedDSPs: AvailableDSP[];
}

function renderContent({ viewModel, mergedDSPs }: RenderContentOptions) {
  switch (viewModel.mode) {
    case 'listen':
      return (
        <div className='flex justify-center'>
          <StaticListenInterface
            artist={viewModel.artist}
            handle={viewModel.artist.handle}
            dspsOverride={mergedDSPs}
            enableDynamicEngagement={viewModel.enableDynamicEngagement}
          />
        </div>
      );

    case 'tip': {
      const venmoLink =
        viewModel.socialLinks.find(link => link.platform === 'venmo')?.url ??
        null;
      const venmoUsername = extractVenmoUsername(venmoLink);

      return (
        <main className='space-y-4' aria-labelledby='tipping-title'>
          <h1 id='tipping-title' className='sr-only'>
            Tip {viewModel.artist.name}
          </h1>

          {venmoLink ? (
            <VenmoTipSelector
              venmoLink={venmoLink}
              venmoUsername={venmoUsername ?? undefined}
              amounts={TIP_AMOUNTS}
            />
          ) : (
            <div className='text-center'>
              <div className='rounded-2xl border border-subtle bg-surface-1 p-6 shadow-sm'>
                <p className='text-sm text-secondary-token' role='alert'>
                  Venmo tipping is not available for this artist yet.
                </p>
              </div>
            </div>
          )}
        </main>
      );
    }

    case 'subscribe':
      // Subscribe mode - show notification subscription form directly
      return (
        <div className='space-y-3 py-2 sm:py-3'>
          {viewModel.subscribeTwoStep ? (
            <TwoStepNotificationsCTA artist={viewModel.artist} />
          ) : (
            <ArtistNotificationsCTA
              artist={viewModel.artist}
              variant='button'
              autoOpen
            />
          )}
        </div>
      );

    case 'contact':
      return (
        <ContactSection
          contacts={viewModel.contacts}
          artistName={viewModel.artist.name}
          artistHandle={viewModel.artist.handle}
        />
      );

    case 'about':
      return (
        <AboutSection artist={viewModel.artist} genres={viewModel.genres} />
      );

    case 'tour':
      return (
        <TourModePanel
          artist={viewModel.artist}
          tourDates={viewModel.tourDates}
        />
      );

    default: // 'profile' mode
      // spotifyPreferred is now read client-side in ProfilePrimaryCTA
      return (
        <div className='space-y-4'>
          <ProfilePrimaryCTA
            artist={viewModel.artist}
            socialLinks={viewModel.socialLinks}
          />
        </div>
      );
  }
}

// Static version without animations for immediate rendering
// NOTE: spotifyPreferred is now read client-side via cookie in ProfilePrimaryCTA
export function StaticArtistPage({
  mode,
  artist,
  socialLinks,
  contacts,
  subtitle,
  showTipButton,
  showBackButton,
  showTourButton = false,
  showFooter = true,
  autoOpenCapture,
  enableDynamicEngagement = false,
  latestRelease,
  photoDownloadSizes = [],
  allowPhotoDownloads = false,
  subscribeTwoStep = false,
  genres,
  tourDates = [],
  visitTrackingToken,
  showSubscriptionConfirmedBanner = true,
  showShopButton = false,
}: StaticArtistPageProps) {
  const mergedDSPs = getMergedDSPs(artist);
  const viewModel = buildProfilePublicViewModel({
    mode,
    artist,
    socialLinks,
    contacts,
    subtitle,
    showTipButton,
    showBackButton,
    showTourButton,
    showFooter,
    autoOpenCapture,
    enableDynamicEngagement,
    latestRelease,
    photoDownloadSizes,
    allowPhotoDownloads,
    subscribeTwoStep,
    genres,
    tourDates,
    visitTrackingToken,
    showSubscriptionConfirmedBanner,
    showShopButton,
  });

  return (
    <PublicProfileTemplate viewModel={viewModel}>
      <div>
        {viewModel.showSubscriptionConfirmedBanner ? (
          <Suspense>
            <SubscriptionConfirmedBanner />
          </Suspense>
        ) : null}
        {viewModel.mode === 'profile' ? (
          <div className='space-y-3'>
            {viewModel.latestRelease && (
              <LatestReleaseCard
                release={viewModel.latestRelease}
                artistHandle={viewModel.artist.handle}
                artist={viewModel.artist}
                dsps={mergedDSPs}
                enableDynamicEngagement={viewModel.enableDynamicEngagement}
              />
            )}
            <div data-testid='primary-cta'>
              <ProfilePrimaryCTA
                artist={viewModel.artist}
                socialLinks={viewModel.socialLinks}
                mergedDSPs={mergedDSPs}
                enableDynamicEngagement={viewModel.enableDynamicEngagement}
                autoOpenCapture={viewModel.autoOpenCapture}
                showCapture
                subscribeTwoStep={viewModel.subscribeTwoStep}
              />
            </div>
          </div>
        ) : (
          renderContent({
            viewModel,
            mergedDSPs,
          })
        )}
      </div>
    </PublicProfileTemplate>
  );
}
