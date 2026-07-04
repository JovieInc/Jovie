import { type Metadata } from 'next';
import { notFound } from 'next/navigation';

// No `export const dynamic` here — the parent layout sets `revalidate: 3600`
// (ISR). The public profile route must stay ISR-cacheable; avoid any Dynamic
// API (cookies(), headers()) in this RSC tree.

import type { PublicRelease } from '@/components/features/profile/releases/types';
import { ErrorBanner } from '@/features/feedback/ErrorBanner';
import { DesktopQrOverlayClient } from '@/features/profile/DesktopQrOverlayClient';
import { ProfileAeoContent } from '@/features/profile/ProfileAeoContent';
import { ProfileViewTracker } from '@/features/profile/ProfileViewTracker';
import { getProfileModeDefinition } from '@/features/profile/registry';
import { StaticArtistPage } from '@/features/profile/StaticArtistPage';
import { JoviePixel } from '@/features/tracking/JoviePixel';
import { getClientTrackingToken } from '@/lib/analytics/tracking-token';
import {
  getProfileVisitorState,
  supportsDirectProfileClaim,
} from '@/lib/claim/visitor-state';
import { toPublicContacts } from '@/lib/contacts/mapper';
import { getReleasesForProfileLite } from '@/lib/discography/queries';
import { getEntityIdentityLinks } from '@/lib/entity/queries';
import { DEFAULT_PROFILE_PAC_ASSIGNMENT } from '@/lib/flags/profile-pac';
// ISR-safe: profile-variant.ts does NOT import cookies() — no dynamic opt-in
import {
  getMerchMvpEnabled,
  getProfileAlertOptInVariant,
  getProfilePacAssignment,
} from '@/lib/flags/profile-variant';
import { getLiveMerchCardsForProfile } from '@/lib/merch/service';
import { buildProfileAeoContent } from '@/lib/profile/aeo-content';
import { getConfirmedFeaturedPlaylistFallback } from '@/lib/profile/featured-playlist-fallback-data';
import {
  buildPublicProfileMetadata,
  PROFILE_ERROR_METADATA,
} from '@/lib/profile/metadata';
import { isShopEnabled } from '@/lib/profile/shop-settings';
import { generateProfileStructuredData } from '@/lib/seo/structured-data';
import { getUpcomingTourDatesForProfile } from '@/lib/tour-dates/queries';
import type { TourDateViewModel } from '@/lib/tour-dates/types';
import { buildAvatarSizes } from '@/lib/utils/avatar-sizes';
import { safeJsonLdStringify } from '@/lib/utils/json-ld';
import { logger } from '@/lib/utils/logger';
import {
  isReservedUsername,
  USERNAME_MAX_LENGTH,
  USERNAME_MIN_LENGTH,
  USERNAME_PATTERN,
} from '@/lib/validation/username-core';
import type { PublicContact } from '@/types/contacts';
import { convertCreatorProfileToArtist } from '@/types/db';
import { PublicClaimBanner } from './_components/PublicClaimBanner';
import { getProfileStaticParams } from './_lib/profile-static-params';
import { getProfileAndLinks } from './_lib/public-profile-loader';

// Profile loader (fetch + cache + per-request memo) lives in
// _lib/public-profile-loader.ts so per-mode routes (plan PR 3a-2b) can
// reuse it without duplicating the cache, error class, or TTL contract.

/**
 * Pre-render featured artist profiles at build time to eliminate cold-start latency.
 * Limited to 100 profiles to keep build times reasonable.
 */
export async function generateStaticParams() {
  return getProfileStaticParams(100);
}

interface Props {
  readonly params: Promise<{
    readonly username: string;
  }>;
}

async function getPublicTourDates(
  profileId: string
): Promise<TourDateViewModel[]> {
  try {
    return await getUpcomingTourDatesForProfile(profileId);
  } catch (error) {
    logger.error(
      'Error fetching public profile tour dates',
      {
        error,
        profileId,
        route: '/[username]',
      },
      'public-profile'
    );
    return [];
  }
}

async function getPublicReleases(
  profileId: string
): Promise<Awaited<ReturnType<typeof getReleasesForProfileLite>>> {
  try {
    return await getReleasesForProfileLite(profileId);
  } catch (error) {
    logger.error(
      'Error fetching public profile releases',
      {
        error,
        profileId,
        route: '/[username]',
      },
      'public-profile'
    );
    return [];
  }
}

async function getPublicMerchCards(profileId: string) {
  try {
    const merchEnabled = await getMerchMvpEnabled(null);
    if (!merchEnabled) {
      return [];
    }

    return await getLiveMerchCardsForProfile(profileId);
  } catch (error) {
    logger.error(
      'Error fetching public profile merch cards',
      {
        error,
        profileId,
        route: '/[username]',
      },
      'public-profile'
    );
    return [];
  }
}

export default async function ArtistPage({ params }: Readonly<Props>) {
  const { username } = await params;
  const initialMode = 'profile';

  // Early reject obviously invalid or reserved usernames before hitting the database
  if (
    username.length < USERNAME_MIN_LENGTH ||
    username.length > USERNAME_MAX_LENGTH ||
    !USERNAME_PATTERN.test(username) ||
    isReservedUsername(username)
  ) {
    notFound();
  }

  const isPublicNoAuthSmoke = process.env.PUBLIC_NOAUTH_SMOKE === '1';
  const viewerCountryCode = null;

  // IMPORTANT: Do NOT read cookies() here — it would opt this ISR route into
  // dynamic rendering, defeating the revalidate: 3600 set in layout.tsx.
  // The jv_aid cookie is set by middleware on every request (analytics still
  // work). The alertOptInVariant defaults to 'button' for ISR; ProfileCompactTemplate
  // renders AnonCookieBootstrap which resolves the per-user variant client-side
  // via /api/profile/audience-anon-cookie and updates its own state.

  const profileResult = await getProfileAndLinks(username);
  const {
    profile,
    links,
    contacts,
    genres,
    status,
    creatorIsPro,
    creatorClerkId,
    latestRelease: fetchedLatestRelease,
    pressPhotos,
  } = profileResult;

  if (status === 'error') {
    return (
      <div className='px-4 py-8'>
        <ErrorBanner
          title='Profile is temporarily unavailable'
          description='We could not load this profile right now, so please refresh or try again in a few minutes.'
          actions={[
            { label: 'Try Again', href: `/${username.toLowerCase()}` },
            { label: 'Go Home', href: '/' },
          ]}
          testId='public-profile-error'
        />
      </div>
    );
  }

  if (!profile) {
    notFound();
  }

  // Kick off independent DB queries immediately so they overlap with the
  // synchronous artist conversion, visitor-state, and tracking-token work below.
  const tourDatesPromise = getPublicTourDates(profile.id);
  const releasesPromise = getPublicReleases(profile.id);
  const merchCardsPromise = getPublicMerchCards(profile.id);
  const entityLinksPromise = getEntityIdentityLinks(profile.id);

  // Convert our profile data to the Artist type expected by components
  const artist = convertCreatorProfileToArtist(profile);
  const directClaimSupported = supportsDirectProfileClaim({
    spotifyId: profile.spotify_id,
  });
  const visitorState = getProfileVisitorState({
    profile: {
      id: profile.id,
      username: artist.handle,
      isClaimed: profile.is_claimed,
      userClerkId: creatorClerkId,
      spotifyId: profile.spotify_id,
    },
    authUserId: null,
    pendingClaimContext: null,
  });

  // Generate a short-lived HMAC token so the client can authenticate its visit
  // tracking request to /api/audience/visit (requires TRACKING_TOKEN_SECRET).
  // Falls back to undefined gracefully if the secret is not configured.
  const visitTrackingToken =
    getClientTrackingToken(profile.id).token ?? undefined;

  const latestRelease = fetchedLatestRelease;

  const publicContacts: PublicContact[] = toPublicContacts(
    contacts,
    artist.name
  );
  const showPayButton = links.some(link => link.platform === 'venmo');
  const showBackButton = false;
  const subtitle = getProfileModeDefinition(initialMode).subtitle;

  // Read profile photo download settings
  const profileSettings =
    (profile.settings as Record<string, unknown> | null) ?? {};
  const featuredPlaylistFallback =
    getConfirmedFeaturedPlaylistFallback(profileSettings);
  const allowPhotoDownloads =
    profileSettings.allowProfilePhotoDownloads === true;
  const photoDownloadSizes = buildAvatarSizes(
    profileSettings.avatarSizes as Record<string, string> | null | undefined,
    profile.avatar_url
  );

  // Await tour dates + releases (started above, non-blocking — errors logged then resolve to empty)
  // Sort server-side so the client doesn't need a useMemo sort
  const [
    tourDatesRaw,
    allReleases,
    merchCards,
    alertOptInVariant,
    profilePacAssignment,
    entityLinks,
  ] = await Promise.all([
    tourDatesPromise.catch(() => [] as TourDateViewModel[]),
    releasesPromise,
    merchCardsPromise,
    // stableId is null for ISR renders — returns the default 'button' variant.
    // AnonCookieBootstrap resolves the per-user variant on the client side.
    // .catch ensures a Statsig outage doesn't fail the whole ISR page render.
    getProfileAlertOptInVariant(null).catch(() => 'button' as const),
    getProfilePacAssignment(null).catch(() => DEFAULT_PROFILE_PAC_ASSIGNMENT),
    entityLinksPromise.catch(() => []),
  ]);
  const tourDates = [...tourDatesRaw].sort(
    (a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime()
  );

  // Serialize releases for client (query returns newest-first via DESC NULLS LAST)
  const releases: PublicRelease[] = allReleases.map(r => ({
    id: r.id,
    title: r.title,
    slug: r.slug ?? '',
    releaseType: r.releaseType,
    releaseDate: r.releaseDate,
    artworkUrl: r.artworkUrl,
    artistNames: r.artistNames,
    previewUrl: r.primaryPreviewUrl ?? null,
  }));

  // Generate structured data for SEO (after tour dates resolve)
  const structuredData = generateProfileStructuredData(
    profile,
    genres,
    links,
    tourDates,
    entityLinks
  );
  const aeoContent = buildProfileAeoContent({
    artist,
    genres,
    latestRelease,
    releases,
    tourDates,
    merchCards,
    socialLinks: links,
  });

  return (
    <>
      {/* JSON-LD Structured Data for SEO — single @graph for all schemas */}
      <script type='application/ld+json'>
        {safeJsonLdStringify(structuredData)}
      </script>
      {/* FAQPage JSON-LD — feeds AI citation engines and Google FAQ rich results */}
      {aeoContent.faqs.length > 0 && (
        <script type='application/ld+json'>
          {safeJsonLdStringify({
            '@context': 'https://schema.org',
            '@type': 'FAQPage',
            mainEntity: aeoContent.faqs.map(item => ({
              '@type': 'Question',
              name: item.question,
              acceptedAnswer: {
                '@type': 'Answer',
                text: item.answer,
              },
            })),
          })}
        </script>
      )}

      {isPublicNoAuthSmoke ? null : (
        <ProfileViewTracker handle={artist.handle} artistId={artist.id} />
      )}
      <PublicClaimBanner
        profileHandle={artist.handle}
        displayName={artist.name}
        directClaimSupported={directClaimSupported}
        isClaimed={profile.is_claimed}
        visitorState={visitorState}
      />
      {/* Server-side pixel tracking */}
      {isPublicNoAuthSmoke ? null : <JoviePixel profileId={profile.id} />}
      <StaticArtistPage
        mode={initialMode}
        artist={artist}
        socialLinks={links}
        viewerCountryCode={viewerCountryCode}
        contacts={publicContacts}
        subtitle={subtitle}
        showBackButton={showBackButton}
        showPayButton={showPayButton}
        showTourButton={true}
        enableDynamicEngagement={creatorIsPro}
        latestRelease={latestRelease}
        photoDownloadSizes={photoDownloadSizes}
        allowPhotoDownloads={allowPhotoDownloads}
        pressPhotos={pressPhotos}
        subscribeTwoStep
        alertOptInVariant={alertOptInVariant}
        profilePacAssignment={profilePacAssignment}
        genres={genres}
        tourDates={tourDates}
        visitTrackingToken={visitTrackingToken}
        showSubscriptionConfirmedBanner={!isPublicNoAuthSmoke}
        showShopButton={isShopEnabled(profileSettings)}
        profileSettings={{
          showOldReleases: profileSettings.showOldReleases === true,
        }}
        featuredPlaylistFallback={featuredPlaylistFallback}
        releases={releases}
        merchCards={merchCards}
      />
      <ProfileAeoContent content={aeoContent} />
      {isPublicNoAuthSmoke ? null : (
        <DesktopQrOverlayClient handle={artist.handle} />
      )}
    </>
  );
}

// Generate metadata for the page with comprehensive SEO.
// Delegates to the shared builder in lib/profile/metadata.ts so that the
// canonical profile metadata shape is defined in one place and consumed by
// every public-profile route.
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { username } = await params;

  if (
    username.length < USERNAME_MIN_LENGTH ||
    username.length > USERNAME_MAX_LENGTH ||
    !USERNAME_PATTERN.test(username) ||
    isReservedUsername(username)
  ) {
    notFound();
  }

  const profileResult = await getProfileAndLinks(username);
  const { profile, genres, status } = profileResult;

  if (status === 'error') {
    return PROFILE_ERROR_METADATA;
  }

  if (!profile) {
    notFound();
  }

  return buildPublicProfileMetadata({ profile, genres });
}
