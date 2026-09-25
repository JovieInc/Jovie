import { BASE_URL } from '@/constants/app';
import type { PublicRelease } from '@/features/profile/releases/types';
import type { StructuredReleaseCollaborator } from '@/lib/discography/artist-queries';
import {
  getRegistryEntry,
  isDspPlatform,
  normalizePlatformKey,
} from '@/lib/dsp-registry';
import type { PublicMerchCard } from '@/lib/merch/types';
import {
  type EntityMentionContext,
  type EntityMentionSegment,
  linkEntityMentions,
} from '@/lib/profile/entity-mentions';
import type { TourDateViewModel } from '@/lib/tour-dates/types';
import {
  isPaymentSupportPlatform,
  sanitizePublicHref,
} from '@/lib/utils/public-url';
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

export interface ProfileAeoFact {
  readonly label: string;
  readonly value: string;
}

/**
 * Provenance class for a public profile description paragraph.
 *
 * The class lets the semantic guard apply stricter checks to free-form artist
 * claims without treating canonical titles, dates, or relationships as copy
 * to rewrite heuristically.
 */
export type ProfileAeoDescriptionKind =
  | 'identity'
  | 'bio'
  | 'catalog'
  | 'highlight'
  | 'playlist'
  | 'collaboration';

export interface ProfileAeoDescriptionBlock {
  readonly kind: ProfileAeoDescriptionKind;
  readonly text: string;
}

export interface ProfileAeoLink {
  readonly id: string;
  readonly platform: string;
  readonly label: string;
  readonly url: string;
}

export interface ProfileAeoContent {
  readonly artistName: string;
  readonly profileUrl: string;
  readonly facts: readonly ProfileAeoFact[];
  readonly listenLinks: readonly ProfileAeoLink[];
  readonly followLinks: readonly ProfileAeoLink[];
  /** Plain-text paragraphs — used by meta descriptions, JSON-LD, and tests. */
  readonly description: readonly string[];
  /** Description paragraphs with their canonical source class. */
  readonly descriptionBlocks: readonly ProfileAeoDescriptionBlock[];
  /**
   * `description` split into entity-linked segments (parallel array). Render
   * this in the UI; keep `description` for plain-text consumers.
   */
  readonly descriptionSegments: readonly (readonly EntityMentionSegment[])[];
  readonly faqs: readonly ProfileAeoFaqItem[];
}

export interface ProfileAeoValidationIssue {
  readonly code:
    | 'missing-artist-identity'
    | 'invalid-profile-url'
    | 'description-blocks-mismatch'
    | 'empty-description-block'
    | 'description-identity-missing'
    | 'description-segments-mismatch'
    | 'empty-description-segment'
    | 'unsupported-superlative'
    | 'orphaned-quantitative-claim'
    | 'empty-fact-label'
    | 'empty-fact-value'
    | 'empty-faq-question'
    | 'empty-faq-answer'
    | 'faq-identity-missing'
    | 'empty-faq-source-label'
    | 'invalid-faq-source';
  readonly path: string;
  readonly message: string;
}

export interface BuildProfileAeoContentInput {
  readonly artist: Artist;
  readonly genres?: readonly string[] | null;
  readonly latestRelease?: AeoReleaseFact | null;
  readonly releases?: readonly PublicRelease[];
  readonly tourDates?: readonly TourDateViewModel[];
  readonly merchCards?: readonly PublicMerchCard[];
  readonly socialLinks?: readonly LegacySocialLink[];
  /** Exact release-credit edges; never derived from prose or artistNames. */
  readonly releaseCollaborators?: readonly StructuredReleaseCollaborator[];
  /**
   * Linkable entities for this profile (own releases with slugs, credited
   * artists resolved to Jovie handles). When omitted, descriptions render
   * as plain text segments.
   */
  readonly entityMentions?: EntityMentionContext;
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

/**
 * These claims are intentionally excluded from public AEO copy when the
 * profile has no supporting evidence field. A creator's source text remains
 * intact in their profile data; this gate only keeps an unsupported ranking
 * claim out of answer-engine evidence.
 */
const UNSUPPORTED_SUPERLATIVE_PATTERN =
  /\b(?:the\s+world['’]s\s+)?(?:best|greatest|biggest|most\s+(?:important|influential|popular|successful))\s+(?:artist|producer|musician|performer|singer|songwriter|rapper|dj|remixer|band|act)\b/i;
const COPULAR_SUPERLATIVE_PATTERN =
  /\b(?:am|are|is|was|were)\s+(?:the\s+)?(?:best|greatest|biggest)\b/i;
const RELATIONAL_SUPERLATIVE_PATTERN =
  /\b(?:best|greatest|biggest)\s+friend\b/i;
const BARE_RANKING_PATTERN = /\b(?:number\s+one|no\.\s*1|#1)\b/i;

/** A lone number/date has no entity, relationship, or qualifier to preserve. */
const STANDALONE_NUMBER_PATTERN =
  /^(?:[$€£]\s*)?\d+(?:[.,]\d+)?(?:\s*%|\s*(?:usd|eur|gbp))?\.?$/i;
const STANDALONE_YEAR_PATTERN = /^\d{4}(?:[-/]\d{1,2}(?:[-/]\d{1,2})?)?\.?$/;
const MONTH_DATE_PATTERN = /^[a-z]{3,9}\s+\d{1,2}(?:,\s*\d{4})?\.?$/i;

function segmentSentences(value: string): string[] {
  const Segmenter = Intl.Segmenter;
  if (!Segmenter) return [value];

  return [
    ...new Segmenter('en', { granularity: 'sentence' }).segment(value),
  ].map(({ segment }) => segment);
}

function removeQuotedText(value: string): string {
  return value
    .replace(/"[^"\n]*"|“[^”\n]*”|‘[^’\n]*’/g, ' ')
    .replace(/(?<![\p{L}\p{N}])'[^'\n]+'(?=$|[^\p{L}\p{N}])/gu, ' ');
}

function isUnsupportedSuperlativeClaim(value: string): boolean {
  return segmentSentences(value).some(sentence => {
    const searchableValue = removeQuotedText(sentence);
    return (
      UNSUPPORTED_SUPERLATIVE_PATTERN.test(searchableValue) ||
      (COPULAR_SUPERLATIVE_PATTERN.test(searchableValue) &&
        !RELATIONAL_SUPERLATIVE_PATTERN.test(searchableValue)) ||
      BARE_RANKING_PATTERN.test(searchableValue)
    );
  });
}

function isStandaloneQuantitativeClaim(value: string): boolean {
  const normalized = value.trim();
  if (
    STANDALONE_NUMBER_PATTERN.test(normalized) ||
    STANDALONE_YEAR_PATTERN.test(normalized)
  ) {
    return true;
  }

  return (
    MONTH_DATE_PATTERN.test(normalized) &&
    !Number.isNaN(Date.parse(normalized.replace(/\.$/, '')))
  );
}

function sanitizeFreeformClaim(value: string): string | null {
  const retainedSentences = segmentSentences(value).filter(sentence => {
    return (
      !isUnsupportedSuperlativeClaim(sentence) &&
      !isStandaloneQuantitativeClaim(sentence)
    );
  });

  // Keep the native segment text unchanged. In particular, do not rebuild
  // sentences from punctuation-delimited tokens: decimals, URLs, initials,
  // abbreviations, and titles are all valid source text.
  return cleanText(retainedSentences.join(''));
}

function ensureSubjectContext(artistName: string, value: string): string {
  return containsArtistIdentity(value, artistName)
    ? value
    : `${artistName}: ${value}`;
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

/** Absolute URL for share/meta surfaces that require a full origin. */
function absoluteProfileUrl(handle: string): string {
  return new URL(`/${encodeURIComponent(handle)}`, BASE_URL).toString();
}

/**
 * Environment-safe same-origin profile paths for FAQ source links.
 * Relative paths keep staging/preview from hard-linking production jov.ie.
 */
function profilePath(handle: string, path = ''): string {
  return `/${encodeURIComponent(handle)}${path}`;
}

/**
 * Returns `null` for an intentionally absent date and `undefined` for a
 * non-empty value that cannot be trusted as a date.
 */
function parseReleaseTimestamp(
  value: string | Date | null | undefined
): number | null | undefined {
  if (value == null || (typeof value === 'string' && value.trim() === '')) {
    return null;
  }

  const timestamp = new Date(value).getTime();
  return Number.isNaN(timestamp) ? undefined : timestamp;
}

function normalizeReleaseFact(
  release: AeoReleaseFact | null | undefined
): AeoReleaseFact | null {
  const title = cleanText(release?.title);
  if (!title) return null;

  return {
    title,
    slug: cleanText(release?.slug),
    releaseType: cleanText(release?.releaseType),
    releaseDate: release?.releaseDate ?? null,
    artistNames: release?.artistNames
      ? dedupeStrings(release.artistNames)
      : null,
  };
}

function toAeoReleaseFact(release: PublicRelease): AeoReleaseFact | null {
  return normalizeReleaseFact({
    title: release.title,
    slug: release.slug,
    releaseType: release.releaseType,
    releaseDate: release.releaseDate,
    artistNames: release.artistNames,
  });
}

function isCurrentRelease(
  release: AeoReleaseFact | PublicRelease,
  now: Date
): boolean {
  const timestamp = parseReleaseTimestamp(release.releaseDate);
  if (timestamp === undefined) return false;
  if (timestamp === null) return Boolean(cleanText(release.title));

  return timestamp <= now.getTime();
}

function filterCurrentReleases(
  releases: readonly PublicRelease[],
  now: Date
): PublicRelease[] {
  return releases.filter(release => isCurrentRelease(release, now));
}

function selectLatestRelease(
  suppliedRelease: AeoReleaseFact | null | undefined,
  releases: readonly PublicRelease[],
  now: Date
): AeoReleaseFact | null {
  const supplied = normalizeReleaseFact(suppliedRelease);
  const currentSupplied =
    supplied && isCurrentRelease(supplied, now) ? supplied : null;
  const currentReleaseFacts = releases
    .map(toAeoReleaseFact)
    .filter((release): release is AeoReleaseFact =>
      Boolean(release && isCurrentRelease(release, now))
    );
  const candidates = currentSupplied
    ? [currentSupplied, ...currentReleaseFacts]
    : currentReleaseFacts;

  const datedCandidates = candidates
    .map((release, index) => ({
      index,
      release,
      timestamp: parseReleaseTimestamp(release.releaseDate),
    }))
    .filter(
      (
        candidate
      ): candidate is {
        readonly index: number;
        readonly release: AeoReleaseFact;
        readonly timestamp: number;
      } => typeof candidate.timestamp === 'number'
    );

  if (datedCandidates.length > 0) {
    const firstCandidate = datedCandidates[0];
    if (!firstCandidate) return candidates[0] ?? null;

    let latestCandidate = firstCandidate;
    for (const candidate of datedCandidates.slice(1)) {
      if (candidate.timestamp > latestCandidate.timestamp) {
        latestCandidate = candidate;
        continue;
      }
      // The supplied release appears first, so a tie keeps its richer source
      // metadata instead of allowing a catalog row to replace it.
      if (
        candidate.timestamp === latestCandidate.timestamp &&
        candidate.index < latestCandidate.index
      ) {
        latestCandidate = candidate;
      }
    }

    return latestCandidate.release;
  }

  return candidates[0] ?? null;
}

function getProfileSource(artist: Artist): ProfileAeoSource {
  return {
    label: 'Jovie profile',
    href: profilePath(artist.handle),
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
      href: profilePath(artist.handle, `/${encodeURIComponent(slug)}`),
    };
  }

  return getPrimaryListeningSource(artist, socialLinks);
}

function isUpcomingTourDate(tourDate: TourDateViewModel, now: Date): boolean {
  if (tourDate.ticketStatus === 'cancelled') return false;

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

function getUniqueGenres(
  artist: Artist,
  genres: readonly string[] | null | undefined
): string[] {
  return dedupeStrings([...(genres ?? []), ...(artist.genres ?? [])]).slice(
    0,
    5
  );
}

function getHometown(artist: Artist): string | null {
  return cleanText(artist.hometown);
}

function getBasedLocation(artist: Artist): string | null {
  return cleanText(artist.location);
}

/** Prefer hometown for origin phrasing; fall back to current location. */
function getOrigin(artist: Artist): string | null {
  return getHometown(artist) ?? getBasedLocation(artist);
}

function pluralize(count: number, singular: string, plural = `${singular}s`) {
  return `${count} ${count === 1 ? singular : plural}`;
}

function sentenceCase(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function buildFacts(
  artist: Artist,
  genres: readonly string[]
): ProfileAeoFact[] {
  const facts: ProfileAeoFact[] = [];

  if (genres.length > 0) {
    facts.push({ label: 'Genre', value: sentenceCase(genres.join(', ')) });
  }

  if (artist.active_since_year) {
    facts.push({
      label: 'Active Since',
      value: String(artist.active_since_year),
    });
  }

  const hometown = getHometown(artist);
  const based = getBasedLocation(artist);

  // Keep hometown vs based/current location explicit when both exist.
  if (hometown) {
    facts.push({ label: 'Hometown', value: hometown });
  }
  if (based && based !== hometown) {
    facts.push({ label: 'Based In', value: based });
  } else if (!hometown && based) {
    facts.push({ label: 'Based In', value: based });
  }

  return facts;
}

function getPlatformLabel(platform: string): string {
  const key = normalizePlatformKey(platform);
  return (
    (key ? getRegistryEntry(key)?.name : undefined) ?? sentenceCase(platform)
  );
}

function buildLinkSections(
  artist: Artist,
  socialLinks: readonly LegacySocialLink[]
): {
  readonly listenLinks: ProfileAeoLink[];
  readonly followLinks: ProfileAeoLink[];
} {
  const listenLinks: ProfileAeoLink[] = [];
  const followLinks: ProfileAeoLink[] = [];
  const seenPlatforms = new Set<string>();

  for (const link of socialLinks) {
    const url = sanitizePublicHref(link.url);
    if (!url) continue;

    // Payment/support links live in tip flows — keep them out of Follow.
    if (isPaymentSupportPlatform(link.platform)) continue;

    const key = normalizePlatformKey(link.platform) ?? link.platform;
    if (seenPlatforms.has(key)) continue;
    seenPlatforms.add(key);

    const item: ProfileAeoLink = {
      id: link.id,
      platform: link.platform,
      label: getPlatformLabel(link.platform),
      url,
    };
    if (isDspPlatform(link.platform)) {
      listenLinks.push(item);
    } else {
      followLinks.push(item);
    }
  }

  // Profile DSP URL columns fill in destinations that have no social link.
  // YouTube is categorized as social by isDspPlatform, so the column only
  // joins the listen row when the artist has no YouTube social link.
  const dspColumnFallbacks = [
    { platform: 'spotify', url: artist.spotify_url },
    { platform: 'apple_music', url: artist.apple_music_url },
    { platform: 'youtube', url: artist.youtube_url },
  ] as const;

  for (const fallback of dspColumnFallbacks) {
    const url = sanitizePublicHref(fallback.url);
    if (!url || seenPlatforms.has(fallback.platform)) continue;
    seenPlatforms.add(fallback.platform);

    listenLinks.push({
      id: `dsp-column-${fallback.platform}`,
      platform: fallback.platform,
      label: getPlatformLabel(fallback.platform),
      url,
    });
  }

  return { listenLinks, followLinks };
}

function buildBioDescriptionBlock(
  artist: Artist
): ProfileAeoDescriptionBlock | null {
  const bio = cleanText(artist.tagline);
  const safeBio = bio ? sanitizeFreeformClaim(bio) : null;
  if (!safeBio) return null;

  return {
    kind: 'bio',
    text: ensureSubjectContext(artist.name, trimSentence(safeBio)),
  };
}

function buildCatalogDescriptionBlock(params: {
  readonly artist: Artist;
  readonly latestRelease: AeoReleaseFact | null;
  readonly releases: readonly PublicRelease[];
  readonly tourDates: readonly TourDateViewModel[];
  readonly merchCards: readonly PublicMerchCard[];
  readonly now: Date;
}): ProfileAeoDescriptionBlock | null {
  const { artist, latestRelease, releases, tourDates, merchCards, now } =
    params;
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

  if (!latestRelease?.title && catalogFacts.length === 0) return null;

  const releasePhrase = latestRelease?.title
    ? `${artist.name}'s latest listed release is "${latestRelease.title}"`
    : `${artist.name}'s public catalog is listed on Jovie`;
  const catalogPhrase =
    catalogFacts.length > 0
      ? `, with ${formatList(catalogFacts)} on the profile`
      : '';

  return {
    kind: 'catalog',
    text: `${releasePhrase}${catalogPhrase}.`,
  };
}

function buildHighlightDescriptionBlock(
  artist: Artist
): ProfileAeoDescriptionBlock | null {
  const highlights = cleanText(artist.career_highlights);
  const safeHighlights = highlights ? sanitizeFreeformClaim(highlights) : null;
  if (!safeHighlights) return null;

  return {
    kind: 'highlight',
    text: `${artist.name}'s profile highlights: ${trimSentence(safeHighlights)}`,
  };
}

function buildPlaylistDescriptionBlock(
  artist: Artist
): ProfileAeoDescriptionBlock | null {
  const targetPlaylists = dedupeStrings(artist.target_playlists ?? []).slice(
    0,
    3
  );
  if (targetPlaylists.length === 0) return null;

  return {
    kind: 'playlist',
    text: `Playlist targets listed for ${artist.name} include ${formatList(targetPlaylists)}.`,
  };
}

function buildDescription(params: {
  readonly artist: Artist;
  readonly genres: readonly string[];
  readonly latestRelease?: AeoReleaseFact | null;
  readonly releases: readonly PublicRelease[];
  readonly tourDates: readonly TourDateViewModel[];
  readonly merchCards: readonly PublicMerchCard[];
  readonly now: Date;
}): ProfileAeoDescriptionBlock[] {
  const {
    artist,
    genres,
    latestRelease,
    releases,
    tourDates,
    merchCards,
    now,
  } = params;
  const origin = getOrigin(artist);
  const genrePhrase =
    genres.length > 0
      ? ` known for ${formatList(genres.slice(0, 3))} music`
      : '';
  const originPhrase = origin ? ` from ${origin}` : '';
  const activePhrase = artist.active_since_year
    ? `, active since ${artist.active_since_year}`
    : '';

  // Avoid pronoun mismatch ("Their") and awkward generated boilerplate.
  const lead = `${artist.name} is an artist${genrePhrase}${originPhrase}${activePhrase}. Find ${artist.name} on Jovie at @${artist.handle}.`;
  const description: ProfileAeoDescriptionBlock[] = [
    { kind: 'identity', text: lead },
  ];
  const optionalBlocks = [
    buildBioDescriptionBlock(artist),
    buildCatalogDescriptionBlock({
      artist,
      latestRelease: latestRelease ?? null,
      releases,
      tourDates,
      merchCards,
      now,
    }),
    buildHighlightDescriptionBlock(artist),
    buildPlaylistDescriptionBlock(artist),
  ];
  for (const block of optionalBlocks) {
    if (block) description.push(block);
  }

  return description;
}

interface StructuredCollaboratorParagraph {
  readonly text: string;
  readonly segments: readonly EntityMentionSegment[];
}

function buildStructuredCollaboratorParagraph(
  artistName: string,
  artistHandle: string,
  collaborators: readonly StructuredReleaseCollaborator[]
): StructuredCollaboratorParagraph | null {
  const grouped = new Map<
    string,
    {
      name: string;
      href: string | null;
      releases: Array<{ id: string; title: string; slug: string }>;
    }
  >();

  for (const collaborator of collaborators) {
    const name = cleanText(collaborator.name);
    const releaseTitle = cleanText(collaborator.releaseTitle);
    const releaseSlug = cleanText(collaborator.releaseSlug);
    if (!name || !releaseTitle || !releaseSlug) continue;

    const existing = grouped.get(collaborator.artistId) ?? {
      name,
      href: collaborator.href,
      releases: [],
    };
    if (
      !existing.releases.some(release => release.id === collaborator.releaseId)
    ) {
      existing.releases.push({
        id: collaborator.releaseId,
        title: releaseTitle,
        slug: releaseSlug,
      });
    }
    grouped.set(collaborator.artistId, existing);
    if (grouped.size >= 4) break;
  }

  const entries = [...grouped.values()];
  if (entries.length === 0) return null;

  const segments: EntityMentionSegment[] = [
    {
      type: 'text',
      text: `${cleanText(artistName) ?? 'This artist'}'s credited collaborators include `,
    },
  ];

  entries.forEach((entry, entryIndex) => {
    if (entryIndex > 0) {
      let separator = ', ';
      if (entryIndex === entries.length - 1) {
        separator = entries.length === 2 ? ' and ' : ', and ';
      }
      segments.push({ type: 'text', text: separator });
    }

    segments.push(
      entry.href
        ? { type: 'artist', text: entry.name, href: entry.href }
        : { type: 'text', text: entry.name },
      { type: 'text', text: ' on ' }
    );

    entry.releases.slice(0, 2).forEach((release, releaseIndex) => {
      if (releaseIndex > 0) {
        segments.push({ type: 'text', text: ' and ' });
      }
      segments.push(
        { type: 'text', text: '"' },
        {
          type: 'release',
          text: release.title,
          href: profilePath(
            artistHandle,
            `/${encodeURIComponent(release.slug)}`
          ),
        },
        { type: 'text', text: '"' }
      );
    });
  });

  segments.push({ type: 'text', text: '.' });
  return {
    text: segments.map(segment => segment.text).join(''),
    segments,
  };
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
}): ProfileAeoFaqItem | null {
  const { artist, tourDates, now } = params;
  const upcomingTourDates = [...tourDates]
    .filter(tourDate => isUpcomingTourDate(tourDate, now))
    .sort(
      (left, right) =>
        new Date(left.startDate).getTime() - new Date(right.startDate).getTime()
    );
  const nextTourDate = upcomingTourDates[0] ?? null;

  if (!nextTourDate) {
    // Empty touring FAQ is intentionally omitted from the public surface.
    return null;
  }

  const date = formatDate(nextTourDate.startDate);
  return {
    question: `Is ${artist.name} touring?`,
    answer: `Yes. ${artist.name} has ${pluralize(upcomingTourDates.length, 'upcoming show')} listed on Jovie; the next listed date is${date ? ` ${date}` : ''} at ${formatTourLocation(nextTourDate)}.`,
    source: nextTourDate.ticketUrl
      ? { label: 'Ticket listing', href: nextTourDate.ticketUrl }
      : {
          label: 'Jovie tour dates',
          href: profilePath(artist.handle, '/tour'),
        },
  };
}

function buildMerchFaq(params: {
  readonly artist: Artist;
  readonly merchCards: readonly PublicMerchCard[];
}): ProfileAeoFaqItem | null {
  const { artist, merchCards } = params;
  const primaryCard = merchCards[0] ?? null;

  if (!primaryCard) {
    // Empty merch FAQ is intentionally omitted from the public surface.
    return null;
  }

  const price = formatPrice(primaryCard.retailPriceCents);
  return {
    question: `Where can I buy ${artist.name} merch?`,
    answer: `Official ${artist.name} merch is available on Jovie. The current featured item is "${primaryCard.title}", a ${primaryCard.productType}${price ? ` priced at ${price}` : ''}.`,
    source: {
      label: 'Official merch card',
      href: profilePath(
        artist.handle,
        `/merch/${encodeURIComponent(primaryCard.id)}`
      ),
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
  releaseCollaborators = [],
  entityMentions,
  now = new Date(),
}: BuildProfileAeoContentInput): ProfileAeoContent {
  const uniqueGenres = getUniqueGenres(artist, genres);
  const { listenLinks, followLinks } = buildLinkSections(artist, socialLinks);
  const currentReleases = filterCurrentReleases(releases, now);
  const selectedLatestRelease = selectLatestRelease(
    latestRelease,
    currentReleases,
    now
  );

  const descriptionBlocks = buildDescription({
    artist,
    genres: uniqueGenres,
    latestRelease: selectedLatestRelease,
    releases: currentReleases,
    tourDates,
    merchCards,
    now,
  });
  const collaboratorParagraph = buildStructuredCollaboratorParagraph(
    artist.name,
    artist.handle,
    releaseCollaborators
  );
  if (collaboratorParagraph) {
    descriptionBlocks.push({
      kind: 'collaboration',
      text: collaboratorParagraph.text,
    });
  }
  const description = descriptionBlocks.map(block => block.text);
  const mentionContext: EntityMentionContext = entityMentions ?? {
    ownHandle: artist.handle,
  };

  return {
    artistName: artist.name,
    profileUrl: absoluteProfileUrl(artist.handle),
    facts: buildFacts(artist, uniqueGenres),
    listenLinks,
    followLinks,
    description,
    descriptionBlocks,
    descriptionSegments: descriptionBlocks.map(block =>
      block.kind === 'collaboration' && collaboratorParagraph
        ? collaboratorParagraph.segments
        : linkEntityMentions(block.text, mentionContext)
    ),
    faqs: [
      buildOriginFaq(artist),
      buildLatestReleaseFaq({
        artist,
        latestRelease: selectedLatestRelease,
        releases: currentReleases,
        socialLinks,
      }),
      buildTouringFaq({ artist, tourDates, now }),
      buildMerchFaq({ artist, merchCards }),
    ].filter((faq): faq is ProfileAeoFaqItem => faq !== null),
  };
}

export interface ProfileAeoFaqStructuredData {
  readonly '@context': 'https://schema.org';
  readonly '@type': 'FAQPage';
  readonly mainEntity: readonly {
    readonly '@type': 'Question';
    readonly name: string;
    readonly acceptedAnswer: {
      readonly '@type': 'Answer';
      readonly text: string;
    };
  }[];
}

/** Build FAQ JSON-LD from the exact FAQ objects rendered in visible HTML. */
export function buildProfileAeoFaqStructuredData(
  content: Pick<ProfileAeoContent, 'faqs'>
): ProfileAeoFaqStructuredData {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: content.faqs.map(item => ({
      '@type': 'Question' as const,
      name: item.question,
      acceptedAnswer: {
        '@type': 'Answer' as const,
        text: item.answer,
      },
    })),
  };
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, String.raw`\$&`);
}

function containsArtistIdentity(value: string, artistName: string): boolean {
  const normalizedValue = cleanText(value)?.normalize('NFKC');
  const normalizedName = cleanText(artistName)?.normalize('NFKC');
  if (!normalizedValue || !normalizedName) return false;

  const identityPattern = new RegExp(
    String.raw`(^|[^\p{L}\p{N}])${escapeRegExp(normalizedName)}(?=$|[^\p{L}\p{N}])`,
    'iu'
  );
  return identityPattern.test(normalizedValue);
}

function isValidHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

function isValidSourceHref(value: string): boolean {
  if (value.startsWith('/') && !value.startsWith('//')) return true;
  return isValidHttpUrl(value);
}

function isOrphanedQuantitativeClaim(value: string): boolean {
  const normalized = value.trim();
  if (isStandaloneQuantitativeClaim(normalized)) return true;

  // Generated copy may prefix a lone value with the artist name for
  // attribution. Keep that still-unqualified value out of the validator's
  // accepted set without treating ordinary prose containing a colon as bad.
  const contextualizedValue = normalized.replace(/^[^:]{1,120}:\s*/, '');
  return (
    contextualizedValue !== normalized &&
    isStandaloneQuantitativeClaim(contextualizedValue)
  );
}

/**
 * Validate the semantic contract shared by visible profile copy and its
 * structured-data consumers. This is deterministic and side-effect free so
 * tests and the SEO ratchet can run it without provider or database access.
 */
export function validateProfileAeoContent(
  content: ProfileAeoContent
): ProfileAeoValidationIssue[] {
  const issues: ProfileAeoValidationIssue[] = [];
  const artistName = cleanText(content.artistName);
  const issue = (
    code: ProfileAeoValidationIssue['code'],
    path: string,
    message: string
  ) => {
    issues.push({ code, path, message });
  };

  if (!artistName) {
    issue(
      'missing-artist-identity',
      'artistName',
      'AEO content must identify the artist by name.'
    );
  }
  if (!isValidHttpUrl(content.profileUrl)) {
    issue(
      'invalid-profile-url',
      'profileUrl',
      'AEO content must use an absolute HTTP(S) profile URL.'
    );
  }

  if (content.descriptionBlocks.length !== content.description.length) {
    issue(
      'description-blocks-mismatch',
      'descriptionBlocks',
      'Description blocks and plain-text paragraphs must stay parallel.'
    );
  }

  content.descriptionBlocks.forEach((block, index) => {
    const path = `descriptionBlocks[${index}]`;
    if (!cleanText(block.text)) {
      issue(
        'empty-description-block',
        `${path}.text`,
        'Description blocks must contain visible text.'
      );
    }
    if (artistName && !containsArtistIdentity(block.text, artistName)) {
      issue(
        'description-identity-missing',
        `${path}.text`,
        'Every independently extracted description block must name the artist.'
      );
    }
    if (block.kind === 'bio' || block.kind === 'highlight') {
      if (isUnsupportedSuperlativeClaim(block.text)) {
        issue(
          'unsupported-superlative',
          `${path}.text`,
          'Free-form profile claims must not assert an unsupported ranking.'
        );
      }
      if (isOrphanedQuantitativeClaim(block.text)) {
        issue(
          'orphaned-quantitative-claim',
          `${path}.text`,
          'A standalone number or date needs an attributable relationship or qualifier.'
        );
      }
    }

    if (content.description[index] !== block.text) {
      issue(
        'description-blocks-mismatch',
        `description[${index}]`,
        'Plain-text description must be derived from the same block text.'
      );
    }
  });

  content.description.forEach((paragraph, index) => {
    if (!cleanText(paragraph)) {
      issue(
        'empty-description-block',
        `description[${index}]`,
        'Description paragraphs must contain visible text.'
      );
    }
  });

  if (content.descriptionSegments.length !== content.description.length) {
    issue(
      'description-segments-mismatch',
      'descriptionSegments',
      'Linked description segments must stay parallel with plain-text paragraphs.'
    );
  }

  content.descriptionSegments.forEach((segments, index) => {
    const joined = segments.map(segment => segment.text).join('');
    segments.forEach((segment, segmentIndex) => {
      if (!cleanText(segment.text)) {
        issue(
          'empty-description-segment',
          `descriptionSegments[${index}][${segmentIndex}]`,
          'Description segments must contain visible text.'
        );
      }
    });
    if (joined !== content.description[index]) {
      issue(
        'description-segments-mismatch',
        `descriptionSegments[${index}]`,
        'Linked segments must reconstruct the exact visible paragraph.'
      );
    }
  });

  content.facts.forEach((fact, index) => {
    if (!cleanText(fact.label)) {
      issue(
        'empty-fact-label',
        `facts[${index}].label`,
        'Canonical facts need a non-empty label.'
      );
    }
    if (!cleanText(fact.value)) {
      issue(
        'empty-fact-value',
        `facts[${index}].value`,
        'Canonical facts need a non-empty value.'
      );
    }
  });

  content.faqs.forEach((faq, index) => {
    const path = `faqs[${index}]`;
    if (!cleanText(faq.question)) {
      issue(
        'empty-faq-question',
        `${path}.question`,
        'FAQ questions must contain visible text.'
      );
    }
    if (!cleanText(faq.answer)) {
      issue(
        'empty-faq-answer',
        `${path}.answer`,
        'FAQ answers must contain visible text.'
      );
    }
    if (
      artistName &&
      (!containsArtistIdentity(faq.question, artistName) ||
        !containsArtistIdentity(faq.answer, artistName))
    ) {
      issue(
        'faq-identity-missing',
        path,
        'FAQ question and answer must preserve the artist identity.'
      );
    }
    if (!cleanText(faq.source.label)) {
      issue(
        'empty-faq-source-label',
        `${path}.source.label`,
        'FAQ sources need a visible label.'
      );
    }
    if (!isValidSourceHref(faq.source.href)) {
      issue(
        'invalid-faq-source',
        `${path}.source.href`,
        'FAQ sources must use a same-origin path or an absolute HTTP(S) URL.'
      );
    }
  });

  return issues;
}
