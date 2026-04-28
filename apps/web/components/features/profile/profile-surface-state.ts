import type { ProfilePrimaryTab } from '@/features/profile/contracts';
import type { PublicRelease } from '@/features/profile/releases/types';
import type { ConfirmedFeaturedPlaylistFallback } from '@/lib/profile/featured-playlist-fallback';
import { getProfileReleaseVisibility } from '@/lib/profile/release-visibility';
import type { TourDateViewModel } from '@/lib/tour-dates/types';
import type { AvatarSize } from '@/lib/utils/avatar-sizes';
import { getHeaderSocialLinks } from '@/lib/utils/context-aware-links';
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

function toDateValue(value: ProfileSurfaceDateInput) {
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

function startOfLocalDay(date: Date) {
  const normalized = new Date(date);
  normalized.setHours(0, 0, 0, 0);
  return normalized;
}

function getUpcomingTourDates(
  tourDates: readonly TourDateViewModel[],
  now = new Date()
) {
  const today = startOfLocalDay(now);

  return [...tourDates]
    .filter(tourDate => {
      const start = toDateValue(tourDate.startDate);
      return (
        start !== null && startOfLocalDay(start).getTime() >= today.getTime()
      );
    })
    .sort(
      (left, right) =>
        (toDateValue(left.startDate)?.getTime() ?? 0) -
        (toDateValue(right.startDate)?.getTime() ?? 0)
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
  const resolved = toDateValue(date);
  if (!resolved) return 'Soon';
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
  }).format(resolved);
}

export function formatProfileSurfaceDay(date: ProfileSurfaceDateInput) {
  const resolved = toDateValue(date);
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
}): ProfileSurfaceState['emptyState'] {
  const { isSubscribed, featuredPlaylistFallback } = params;

  return {
    release: isSubscribed
      ? 'New music alerts are on.'
      : 'Follow for the next release.',
    tour: 'No upcoming shows.',
    homeProof: featuredPlaylistFallback
      ? 'Featured playlist ready.'
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
  } = params;

  const heroImageUrl = unwrapNextImageUrl(
    photoDownloadSizes.find(size => size.key === 'large')?.url ??
      photoDownloadSizes.find(size => size.key === 'original')?.url ??
      artist.image_url ??
      null
  );
  const releaseVisibility = getProfileReleaseVisibility(
    latestRelease,
    profileSettings
  );
  const latestVisibleRelease =
    releaseVisibility?.show && latestRelease ? latestRelease : null;
  const upcomingTourDates = getUpcomingTourDates(tourDates, now);
  const nextShow = upcomingTourDates[0] ?? null;
  const visibleReleases = releases.filter(release => Boolean(release.slug));
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
    }),
  };
}
