import type { ProfilePrimaryTab } from '@/features/profile/contracts';
import type { PublicRelease } from '@/features/profile/releases/types';
import type { ConfirmedFeaturedPlaylistFallback } from '@/lib/profile/featured-playlist-fallback';
import { getProfileReleaseVisibility } from '@/lib/profile/release-visibility';
import type { TourDateViewModel } from '@/lib/tour-dates/types';
import type { AvatarSize } from '@/lib/utils/avatar-sizes';
import { getHeaderSocialLinks } from '@/lib/utils/context-aware-links';
import { isDefaultAvatarUrl } from '@/lib/utils/dsp-images';
import type { Artist, LegacySocialLink } from '@/types/db';

export type ProfileSurfaceLatestRelease = {
  readonly title: string;
  readonly slug: string;
  readonly artworkUrl: string | null;
  readonly releaseDate: Date | string | null;
  readonly revealDate?: Date | string | null;
  readonly releaseType: string;
};

export type ProfileSurfacePrimaryAction =
  | {
      readonly kind: 'tour';
      readonly label: 'Tickets' | 'Shows';
      readonly mode: ProfilePrimaryTab;
      readonly href: string | null;
    }
  | {
      readonly kind: 'listen';
      readonly label: 'Listen';
      readonly mode: ProfilePrimaryTab;
      readonly href: null;
    }
  | {
      readonly kind: 'subscribe';
      readonly label: 'Get Alerts' | 'Manage Alerts';
      readonly mode: ProfilePrimaryTab;
      readonly href: null;
    };

type ProfileSurfaceDateInput = Date | string | null | undefined;

export interface ProfileSurfaceState {
  readonly heroImageUrl: string | null;
  readonly heroSubtitle: string;
  readonly heroRoleLabel: string | null;
  readonly statusPill: {
    readonly kind: 'tour' | 'release' | 'alerts';
    readonly label: 'On Tour' | 'New Release' | 'Alerts On' | 'Alerts Ready';
  };
  readonly primaryAction: ProfileSurfacePrimaryAction;
  readonly latestVisibleRelease: ProfileSurfaceLatestRelease | null;
  readonly visibleReleases: readonly PublicRelease[];
  readonly upcomingTourDates: readonly TourDateViewModel[];
  readonly nextShow: TourDateViewModel | null;
  readonly visibleSocialLinks: readonly LegacySocialLink[];
  readonly hasTip: boolean;
  readonly hasReleases: boolean;
  readonly emptyState: {
    readonly release: string;
    readonly tour: string;
    readonly homeProof: string;
  };
}

export const PUBLIC_MUSIC_EMPTY_HEADING = 'No releases listed yet';
export const PUBLIC_MUSIC_EMPTY_DESCRIPTION =
  'Get a note when the first release lands.';
export const PUBLIC_MUSIC_ERROR_HEADING = "Couldn't load releases";
export const PUBLIC_MUSIC_ERROR_DESCRIPTION = 'Try again in a moment.';
export const PUBLIC_EVENTS_NO_UPCOMING_HEADING = 'No upcoming shows';
export const PUBLIC_EVENTS_NO_UPCOMING = `${PUBLIC_EVENTS_NO_UPCOMING_HEADING}.`;
export const PUBLIC_EVENTS_NO_SURFACE = 'No live shows listed.';

export type PublicMusicSurface =
  | {
      readonly kind: 'catalog';
      readonly visibleReleases: readonly PublicRelease[];
    }
  | { readonly kind: 'artist-streaming' }
  | { readonly kind: 'empty' }
  | { readonly kind: 'error' };

export function getVisiblePublicReleases(
  releases: readonly PublicRelease[] | undefined
): PublicRelease[] {
  return (releases ?? []).filter(release => Boolean(release.slug));
}

export function resolvePublicMusicSurface(params: {
  readonly releases?: readonly PublicRelease[];
  readonly hasPlayableDestinations: boolean;
  readonly catalogLoadFailed?: boolean;
}): PublicMusicSurface {
  if (params.catalogLoadFailed) {
    return { kind: 'error' };
  }

  const visibleReleases = getVisiblePublicReleases(params.releases);
  if (visibleReleases.length > 0) {
    return { kind: 'catalog', visibleReleases };
  }

  if (params.hasPlayableDestinations) {
    return { kind: 'artist-streaming' };
  }

  return { kind: 'empty' };
}

export function shouldOfferPublicEventsDestination(
  upcomingTourDateCount: number
): boolean {
  return upcomingTourDateCount > 0;
}

function unwrapNextImageUrl(url: string | null | undefined): string | null {
  if (!url) return null;

  try {
    const parsed = new URL(url, 'http://localhost');
    if (parsed.pathname !== '/_next/image') {
      return url;
    }

    return parsed.searchParams.get('url') ?? url;
  } catch {
    return url;
  }
}

export function toProfileSurfaceDateValue(value: ProfileSurfaceDateInput) {
  if (!value) {
    return null;
  }

  if (value instanceof Date) {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  const dateOnlyMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  const date = dateOnlyMatch
    ? new Date(
        Number(dateOnlyMatch[1]),
        Number(dateOnlyMatch[2]) - 1,
        Number(dateOnlyMatch[3])
      )
    : new Date(value);

  return Number.isNaN(date.getTime()) ? null : date;
}

export function startOfProfileSurfaceLocalDay(date: Date) {
  const normalized = new Date(date);
  normalized.setHours(0, 0, 0, 0);
  return normalized;
}

function getUpcomingTourDates(
  tourDates: readonly TourDateViewModel[],
  now = new Date()
) {
  const today = startOfProfileSurfaceLocalDay(now);

  return [...tourDates]
    .filter(tourDate => {
      const start = toProfileSurfaceDateValue(tourDate.startDate);
      return (
        start !== null &&
        startOfProfileSurfaceLocalDay(start).getTime() >= today.getTime()
      );
    })
    .sort(
      (left, right) =>
        (toProfileSurfaceDateValue(left.startDate)?.getTime() ?? 0) -
        (toProfileSurfaceDateValue(right.startDate)?.getTime() ?? 0)
    );
}

function readHeroRoleLabel(artist: Artist) {
  const label = artist.settings?.heroRoleLabel;
  if (typeof label !== 'string') {
    return null;
  }

  const trimmed = label.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function formatProfileSurfaceMonth(date: ProfileSurfaceDateInput) {
  const resolved = toProfileSurfaceDateValue(date);
  if (!resolved) return 'Soon';
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
  }).format(resolved);
}

export function formatProfileSurfaceDay(date: ProfileSurfaceDateInput) {
  const resolved = toProfileSurfaceDateValue(date);
  if (!resolved) return '—';
  return new Intl.DateTimeFormat('en-US', {
    day: '2-digit',
  }).format(resolved);
}

function resolveHeroSubtitle(artist: Artist, activeSubtitle: string) {
  if (typeof artist.tagline !== 'string') {
    return activeSubtitle;
  }

  const trimmed = artist.tagline.trim();
  return trimmed.length > 0 ? trimmed : activeSubtitle;
}

function resolvePrimaryAction(params: {
  readonly nextShow: TourDateViewModel | null;
  readonly latestVisibleRelease: ProfileSurfaceLatestRelease | null;
  readonly hasPlayableDestinations: boolean;
  readonly isSubscribed: boolean;
}): ProfileSurfacePrimaryAction {
  const {
    nextShow,
    latestVisibleRelease,
    hasPlayableDestinations,
    isSubscribed,
  } = params;

  if (nextShow) {
    return {
      kind: 'tour',
      label: nextShow.ticketUrl ? 'Tickets' : 'Shows',
      mode: 'tour',
      href: nextShow.ticketUrl ?? null,
    };
  }

  if (latestVisibleRelease || hasPlayableDestinations) {
    return {
      kind: 'listen',
      label: 'Listen',
      mode: 'listen',
      href: null,
    };
  }

  return {
    kind: 'subscribe',
    label: isSubscribed ? 'Manage Alerts' : 'Get Alerts',
    mode: 'subscribe',
    href: null,
  };
}

function resolveStatusPill(params: {
  readonly nextShow: TourDateViewModel | null;
  readonly latestVisibleRelease: ProfileSurfaceLatestRelease | null;
  readonly isSubscribed: boolean;
}): ProfileSurfaceState['statusPill'] {
  const { nextShow, latestVisibleRelease, isSubscribed } = params;

  if (nextShow) {
    return {
      kind: 'tour',
      label: 'On Tour',
    };
  }

  if (latestVisibleRelease) {
    return {
      kind: 'release',
      label: 'New Release',
    };
  }

  return {
    kind: 'alerts',
    label: isSubscribed ? 'Alerts On' : 'Alerts Ready',
  };
}

function resolveEmptyState(params: {
  readonly isSubscribed: boolean;
  readonly featuredPlaylistFallback?: ConfirmedFeaturedPlaylistFallback | null;
  readonly catalogLoadFailed?: boolean;
}): ProfileSurfaceState['emptyState'] {
  const { isSubscribed, featuredPlaylistFallback, catalogLoadFailed } = params;

  return {
    release: catalogLoadFailed
      ? `${PUBLIC_MUSIC_ERROR_HEADING}.`
      : `${PUBLIC_MUSIC_EMPTY_HEADING}.`,
    tour: PUBLIC_EVENTS_NO_UPCOMING,
    homeProof: featuredPlaylistFallback
      ? 'Featured playlist ready.'
      : isSubscribed
        ? 'Updates are on.'
        : 'Follow for new music and show updates.',
  };
}

export function resolveProfileSurfaceState(params: {
  readonly artist: Artist;
  readonly socialLinks: readonly LegacySocialLink[];
  readonly photoDownloadSizes?: readonly AvatarSize[];
  readonly latestRelease?: ProfileSurfaceLatestRelease | null;
  readonly profileSettings?: { readonly showOldReleases?: boolean } | null;
  readonly featuredPlaylistFallback?: ConfirmedFeaturedPlaylistFallback | null;
  readonly tourDates?: readonly TourDateViewModel[];
  readonly releases?: readonly PublicRelease[];
  readonly hasPlayableDestinations: boolean;
  readonly showPayButton?: boolean;
  readonly isSubscribed?: boolean;
  readonly activeSubtitle: string;
  readonly viewerCountryCode?: string | null;
  readonly socialLinkLimit?: number;
  readonly now?: Date;
  readonly catalogLoadFailed?: boolean;
}): ProfileSurfaceState {
  const {
    artist,
    socialLinks,
    photoDownloadSizes = [],
    latestRelease = null,
    profileSettings,
    featuredPlaylistFallback,
    tourDates = [],
    releases = [],
    hasPlayableDestinations,
    showPayButton = true,
    isSubscribed = false,
    activeSubtitle,
    viewerCountryCode,
    socialLinkLimit = 2,
    now,
    catalogLoadFailed = false,
  } = params;

  const rawHeroImageUrl = unwrapNextImageUrl(
    photoDownloadSizes.find(size => size.key === 'large')?.url ??
      photoDownloadSizes.find(size => size.key === 'original')?.url ??
      artist.image_url ??
      null
  );
  const heroImageUrl = isDefaultAvatarUrl(rawHeroImageUrl)
    ? null
    : rawHeroImageUrl;
  const releaseVisibility = getProfileReleaseVisibility(
    latestRelease,
    profileSettings,
    now
  );
  const latestVisibleRelease =
    releaseVisibility?.show && latestRelease ? latestRelease : null;
  const upcomingTourDates = getUpcomingTourDates(tourDates, now);
  const nextShow = upcomingTourDates[0] ?? null;
  const visibleReleases = getVisiblePublicReleases(releases);
  const hasTip =
    showPayButton && socialLinks.some(link => link.platform === 'venmo');
  const heroSubtitle = resolveHeroSubtitle(artist, activeSubtitle);
  const visibleSocialLinks = getHeaderSocialLinks(
    [...socialLinks],
    viewerCountryCode,
    socialLinkLimit
  );
  const primaryAction = resolvePrimaryAction({
    nextShow,
    latestVisibleRelease,
    hasPlayableDestinations,
    isSubscribed,
  });
  const statusPill = resolveStatusPill({
    nextShow,
    latestVisibleRelease,
    isSubscribed,
  });

  return {
    heroImageUrl,
    heroSubtitle,
    heroRoleLabel: readHeroRoleLabel(artist),
    statusPill,
    primaryAction,
    latestVisibleRelease,
    visibleReleases,
    upcomingTourDates,
    nextShow,
    visibleSocialLinks,
    hasTip,
    hasReleases: visibleReleases.length > 0,
    emptyState: resolveEmptyState({
      isSubscribed,
      featuredPlaylistFallback,
      catalogLoadFailed,
    }),
  };
}

export function hasPublicProfileHistoryDestination(params: {
  readonly historyLength: number;
  readonly referrer: string;
}): boolean {
  return params.historyLength > 1 && params.referrer.trim().length > 0;
}

export function subscribeToPublicProfileHistory() {
  return () => {};
}

export function getPublicProfileHistorySnapshot() {
  if (typeof document === 'undefined') {
    return false;
  }

  return hasPublicProfileHistoryDestination({
    historyLength: globalThis.history.length,
    referrer: document.referrer,
  });
}

export function getPublicProfileHistoryServerSnapshot() {
  return false;
}

export type PublicProfileBackAction =
  | 'profile-root'
  | 'history-back'
  | 'history-exit'
  | 'app-fallback'
  | 'none';

export function shouldShowPublicProfileBackChevron(params: {
  readonly isProfileRoot: boolean;
  readonly hasHistoryDestination: boolean;
  readonly isSignedIn?: boolean;
  readonly forceHidden?: boolean;
}): boolean {
  if (params.forceHidden) {
    return false;
  }
  if (!params.isProfileRoot) {
    return true;
  }
  if (params.isSignedIn) {
    return true;
  }
  return params.hasHistoryDestination;
}

export const PUBLIC_PROFILE_HISTORY_DEPTH_KEY = 'joviePublicProfileDepth';

export function readPublicProfileHistoryDepth(state: unknown): number {
  if (!state || typeof state !== 'object' || Array.isArray(state)) {
    return 0;
  }
  const depth = Reflect.get(state, PUBLIC_PROFILE_HISTORY_DEPTH_KEY);
  return typeof depth === 'number' && Number.isFinite(depth) && depth >= 0
    ? Math.floor(depth)
    : 0;
}

export function withPublicProfileHistoryDepth(
  state: unknown,
  depth: number
): Record<string, unknown> {
  const base =
    state && typeof state === 'object' && !Array.isArray(state)
      ? { ...(state as Record<string, unknown>) }
      : {};
  return {
    ...base,
    [PUBLIC_PROFILE_HISTORY_DEPTH_KEY]: depth,
  };
}

export function getPublicProfileHistoryExitDelta(
  internalHistoryDepth: number
): number {
  return -(Math.max(0, internalHistoryDepth) + 1);
}

function hasInternalPublicProfileHistory(params: {
  readonly historyLength: number;
  readonly arrivalHistoryLength?: number;
  readonly internalHistoryDepth?: number;
}): boolean {
  if (params.internalHistoryDepth !== undefined) {
    return params.internalHistoryDepth > 0;
  }
  const arrival = params.arrivalHistoryLength ?? params.historyLength;
  return params.historyLength > arrival;
}

export function resolvePublicProfileBackAction(params: {
  readonly isProfileRoot: boolean;
  readonly historyLength: number;
  readonly referrer: string;
  readonly isSignedIn?: boolean;
  readonly arrivalHistoryLength?: number;
  readonly internalHistoryDepth?: number;
}): PublicProfileBackAction {
  if (!params.isProfileRoot) {
    return 'profile-root';
  }

  const arrival = params.arrivalHistoryLength ?? params.historyLength;
  const hasInternalEntries = hasInternalPublicProfileHistory(params);

  if (params.isSignedIn) {
    // New-tab / no prior surface: never walk internal mode pushStates.
    if (arrival <= 1) {
      return 'app-fallback';
    }
    return hasInternalEntries ? 'history-exit' : 'history-back';
  }

  if (!hasPublicProfileHistoryDestination(params)) {
    return 'none';
  }
  return hasInternalEntries ? 'history-exit' : 'history-back';
}
