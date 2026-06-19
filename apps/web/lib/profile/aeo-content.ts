import { BASE_URL } from '@/constants/app';
import type { PublicRelease } from '@/features/profile/releases/types';
import type { PublicMerchCard } from '@/lib/merch/types';
import type { TourDateViewModel } from '@/lib/tour-dates/types';
import type { Artist, LegacySocialLink } from '@/types/db';

interface AeoReleaseFact {
  readonly title: string;
  readonly slug?: string | null;
  readonly releaseType?: string | null;
  readonly releaseDate?: string | Date | null;
  readonly artistNames?: readonly string[] | null;
}

export interface ProfileAeoSource {
  readonly label: string;
  readonly href: string;
}

export interface ProfileAeoFaqItem {
  readonly question: string;
  readonly answer: string;
  readonly source: ProfileAeoSource;
}

export interface ProfileAeoContent {
  readonly artistName: string;
  readonly profileUrl: string;
  readonly description: readonly string[];
  readonly faqs: readonly ProfileAeoFaqItem[];
}

export interface BuildProfileAeoContentInput {
  readonly artist: Artist;
  readonly genres?: readonly string[] | null;
  readonly latestRelease?: AeoReleaseFact | null;
  readonly releases?: readonly PublicRelease[];
  readonly tourDates?: readonly TourDateViewModel[];
  readonly merchCards?: readonly PublicMerchCard[];
  readonly socialLinks?: readonly LegacySocialLink[];
  readonly now?: Date;
}

function cleanText(value: string | null | undefined): string | null {
  if (!value) return null;
  const cleaned = value.replaceAll(/\s+/g, ' ').trim();
  return cleaned.length > 0 ? cleaned : null;
}

function trimSentence(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return trimmed;
  return /[.!?]$/.test(trimmed) ? trimmed : `${trimmed}.`;
}

function dedupeStrings(values: readonly string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const value of values) {
    const cleaned = cleanText(value);
    if (!cleaned) continue;

    const key = cleaned.toLowerCase();
    if (seen.has(key)) continue;

    seen.add(key);
    result.push(cleaned);
  }

  return result;
}

function formatList(values: readonly string[]): string {
  if (values.length === 0) return '';
  if (values.length === 1) return values[0] ?? '';
  if (values.length === 2) return `${values[0]} and ${values[1]}`;

  return `${values.slice(0, -1).join(', ')}, and ${values.at(-1)}`;
}

function formatReleaseType(value: string | null | undefined): string {
  const cleaned = cleanText(value?.replaceAll('_', ' '));
  return cleaned ?? 'release';
}

function formatDate(value: string | Date | null | undefined): string | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;

  return new Intl.DateTimeFormat('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(date);
}

function formatPrice(cents: number | null | undefined): string | null {
  if (!Number.isFinite(cents) || cents == null || cents < 0) return null;
  return new Intl.NumberFormat('en-US', {
    currency: 'USD',
    style: 'currency',
  }).format(cents / 100);
}

function absoluteProfileUrl(handle: string): string {
  return new URL(`/${encodeURIComponent(handle)}`, BASE_URL).toString();
}

function absoluteProfilePath(handle: string, path = ''): string {
  return new URL(`/${encodeURIComponent(handle)}${path}`, BASE_URL).toString();
}

function getProfileSource(artist: Artist): ProfileAeoSource {
  return {
    label: 'Jovie profile',
    href: absoluteProfileUrl(artist.handle),
  };
}

function getPrimaryListeningSource(
  artist: Artist,
  socialLinks: readonly LegacySocialLink[]
): ProfileAeoSource {
  if (artist.spotify_url) {
    return { label: 'Spotify', href: artist.spotify_url };
  }

  const spotifyLink = socialLinks.find(link => link.platform === 'spotify');
  if (spotifyLink?.url) {
    return { label: 'Spotify', href: spotifyLink.url };
  }

  if (artist.apple_music_url) {
    return { label: 'Apple Music', href: artist.apple_music_url };
  }

  return getProfileSource(artist);
}

function getReleaseSource(
  artist: Artist,
  release: AeoReleaseFact | null | undefined,
  socialLinks: readonly LegacySocialLink[]
): ProfileAeoSource {
  const slug = cleanText(release?.slug);
  if (slug) {
    return {
      label: 'Jovie release page',
      href: absoluteProfilePath(artist.handle, `/${encodeURIComponent(slug)}`),
    };
  }

  return getPrimaryListeningSource(artist, socialLinks);
}

function isUpcomingTourDate(tourDate: TourDateViewModel, now: Date): boolean {
  const startDate = new Date(tourDate.startDate);
  if (Number.isNaN(startDate.getTime())) return false;
  return startDate.getTime() >= now.getTime();
}

function formatTourLocation(tourDate: TourDateViewModel): string {
  const location = [tourDate.city, tourDate.region, tourDate.country]
    .filter(Boolean)
    .join(', ');
  return location ? `${tourDate.venueName} in ${location}` : tourDate.venueName;
}

function sameArtistName(left: string, right: string): boolean {
  return left.trim().toLowerCase() === right.trim().toLowerCase();
}

function getCollaborators(params: {
  readonly artistName: string;
  readonly artistHandle: string;
  readonly releases: readonly PublicRelease[];
}): string[] {
  return dedupeStrings(
    params.releases.flatMap(release => release.artistNames ?? [])
  )
    .filter(
      name =>
        !sameArtistName(name, params.artistName) &&
        !sameArtistName(name, params.artistHandle)
    )
    .slice(0, 4);
}

function getUniqueGenres(
  artist: Artist,
  genres: readonly string[] | null | undefined
): string[] {
  return dedupeStrings([...(genres ?? []), ...(artist.genres ?? [])]).slice(
    0,
    5
  );
}

function getOrigin(artist: Artist): string | null {
  return cleanText(artist.hometown) ?? cleanText(artist.location);
}

function pluralize(count: number, singular: string, plural = `${singular}s`) {
  return `${count} ${count === 1 ? singular : plural}`;
}

function buildDescription(params: {
  readonly artist: Artist;
  readonly genres: readonly string[];
  readonly latestRelease?: AeoReleaseFact | null;
  readonly releases: readonly PublicRelease[];
  readonly tourDates: readonly TourDateViewModel[];
  readonly merchCards: readonly PublicMerchCard[];
  readonly collaborators: readonly string[];
  readonly now: Date;
}): string[] {
  const {
    artist,
    genres,
    latestRelease,
    releases,
    tourDates,
    merchCards,
    collaborators,
    now,
  } = params;
  const origin = getOrigin(artist);
  const genrePhrase =
    genres.length > 0 ? ` working in ${formatList(genres.slice(0, 3))}` : '';
  const originPhrase = origin ? ` from ${origin}` : '';
  const activePhrase = artist.active_since_year
    ? `, active since ${artist.active_since_year}`
    : '';

  const lead = `${artist.name} is an artist${genrePhrase}${originPhrase}${activePhrase}. Their public Jovie profile is @${artist.handle}.`;
  const description = [lead];
  const bio = cleanText(artist.tagline);
  if (bio) {
    description.push(trimSentence(bio));
  }

  const upcomingTourDateCount = tourDates.filter(tourDate =>
    isUpcomingTourDate(tourDate, now)
  ).length;
  const catalogFacts = [
    releases.length > 0 ? pluralize(releases.length, 'listed release') : null,
    upcomingTourDateCount > 0
      ? pluralize(upcomingTourDateCount, 'upcoming show')
      : null,
    merchCards.length > 0 ? pluralize(merchCards.length, 'merch item') : null,
  ].filter((value): value is string => Boolean(value));

  if (latestRelease?.title || catalogFacts.length > 0) {
    const releasePhrase = latestRelease?.title
      ? `The latest listed release is "${latestRelease.title}"`
      : 'The public catalog is listed on Jovie';
    const catalogPhrase =
      catalogFacts.length > 0
        ? `, with ${formatList(catalogFacts)} on the profile`
        : '';
    description.push(`${releasePhrase}${catalogPhrase}.`);
  }

  const highlights = cleanText(artist.career_highlights);
  if (highlights) {
    description.push(`Profile highlights: ${trimSentence(highlights)}`);
  }

  if (collaborators.length > 0) {
    description.push(
      `Recent release credits on the profile also mention ${formatList(collaborators)}.`
    );
  }

  const targetPlaylists = dedupeStrings(artist.target_playlists ?? []).slice(
    0,
    3
  );
  if (targetPlaylists.length > 0) {
    description.push(
      `Playlist targets listed for ${artist.name} include ${formatList(targetPlaylists)}.`
    );
  }

  return description;
}

function buildOriginFaq(artist: Artist): ProfileAeoFaqItem {
  const origin = getOrigin(artist);
  const location = cleanText(artist.location);
  const hometown = cleanText(artist.hometown);
  let answer: string;

  if (hometown && location && hometown !== location) {
    answer = `${artist.name} is from ${hometown}; the profile also lists ${location} as their current location.`;
  } else if (origin) {
    answer = `${artist.name} is from ${origin}.`;
  } else {
    answer = `${artist.name}'s public Jovie profile does not list a hometown or origin yet; the canonical profile handle is @${artist.handle}.`;
  }

  return {
    question: `Where is ${artist.name} from?`,
    answer,
    source: getProfileSource(artist),
  };
}

function buildLatestReleaseFaq(params: {
  readonly artist: Artist;
  readonly latestRelease?: AeoReleaseFact | null;
  readonly releases: readonly PublicRelease[];
  readonly socialLinks: readonly LegacySocialLink[];
}): ProfileAeoFaqItem {
  const { artist, latestRelease, releases, socialLinks } = params;
  const releaseDate = formatDate(latestRelease?.releaseDate);
  const releaseType = formatReleaseType(latestRelease?.releaseType);
  const source = getReleaseSource(artist, latestRelease, socialLinks);
  const listedReleaseCount = latestRelease?.title
    ? Math.max(releases.length, 1)
    : releases.length;
  const answer = latestRelease?.title
    ? `${artist.name}'s latest listed release is "${latestRelease.title}", a ${releaseType}${releaseDate ? ` released on ${releaseDate}` : ''}. The public catalog currently lists ${pluralize(listedReleaseCount, 'release')}.`
    : `${artist.name}'s public Jovie profile does not list a release yet. Use the profile's listening links for current music updates.`;

  return {
    question: `What is ${artist.name}'s latest release?`,
    answer,
    source,
  };
}

function buildTouringFaq(params: {
  readonly artist: Artist;
  readonly tourDates: readonly TourDateViewModel[];
  readonly now: Date;
}): ProfileAeoFaqItem {
  const { artist, tourDates, now } = params;
  const upcomingTourDates = [...tourDates]
    .filter(tourDate => isUpcomingTourDate(tourDate, now))
    .sort(
      (left, right) =>
        new Date(left.startDate).getTime() - new Date(right.startDate).getTime()
    );
  const nextTourDate = upcomingTourDates[0] ?? null;

  if (nextTourDate) {
    const date = formatDate(nextTourDate.startDate);
    return {
      question: `Is ${artist.name} touring?`,
      answer: `Yes. ${artist.name} has ${pluralize(upcomingTourDates.length, 'upcoming show')} listed on Jovie; the next listed date is${date ? ` ${date}` : ''} at ${formatTourLocation(nextTourDate)}.`,
      source: nextTourDate.ticketUrl
        ? { label: 'Ticket listing', href: nextTourDate.ticketUrl }
        : {
            label: 'Jovie tour dates',
            href: absoluteProfilePath(artist.handle, '/tour'),
          },
    };
  }

  return {
    question: `Is ${artist.name} touring?`,
    answer: `No upcoming tour dates are listed on ${artist.name}'s public Jovie profile right now.`,
    source: {
      label: 'Jovie tour dates',
      href: absoluteProfilePath(artist.handle, '/tour'),
    },
  };
}

function buildMerchFaq(params: {
  readonly artist: Artist;
  readonly merchCards: readonly PublicMerchCard[];
}): ProfileAeoFaqItem {
  const { artist, merchCards } = params;
  const primaryCard = merchCards[0] ?? null;

  if (primaryCard) {
    const price = formatPrice(primaryCard.retailPriceCents);
    return {
      question: `Where can I buy ${artist.name} merch?`,
      answer: `Official ${artist.name} merch is available on Jovie. The current featured item is "${primaryCard.title}", a ${primaryCard.productType}${price ? ` priced at ${price}` : ''}.`,
      source: {
        label: 'Official merch card',
        href: absoluteProfilePath(
          artist.handle,
          `/merch/${encodeURIComponent(primaryCard.id)}`
        ),
      },
    };
  }

  return {
    question: `Where can I buy ${artist.name} merch?`,
    answer: `No official ${artist.name} merch items are listed on Jovie right now.`,
    source: {
      label: 'Jovie shop',
      href: absoluteProfilePath(artist.handle, '/shop'),
    },
  };
}

export function buildProfileAeoContent({
  artist,
  genres,
  latestRelease,
  releases = [],
  tourDates = [],
  merchCards = [],
  socialLinks = [],
  now = new Date(),
}: BuildProfileAeoContentInput): ProfileAeoContent {
  const uniqueGenres = getUniqueGenres(artist, genres);
  const collaborators = getCollaborators({
    artistName: artist.name,
    artistHandle: artist.handle,
    releases,
  });

  return {
    artistName: artist.name,
    profileUrl: absoluteProfileUrl(artist.handle),
    description: buildDescription({
      artist,
      genres: uniqueGenres,
      latestRelease,
      releases,
      tourDates,
      merchCards,
      collaborators,
      now,
    }),
    faqs: [
      buildOriginFaq(artist),
      buildLatestReleaseFaq({ artist, latestRelease, releases, socialLinks }),
      buildTouringFaq({ artist, tourDates, now }),
      buildMerchFaq({ artist, merchCards }),
    ],
  };
}
