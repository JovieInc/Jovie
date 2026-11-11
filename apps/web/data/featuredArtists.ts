/**
 * The opt-in featured slot on marketing surfaces.
 *
 * Tim (2026-11-08): the homepage does not feature him. Until a real artist
 * opts in, the slot shows the labeled example artist in `demoArtists.ts`,
 * then the top opted-in artists whose content is certified.
 *
 * A real artist reaches the homepage only through a record in
 * `FEATURED_ARTIST_OPT_INS` that passes `featuredArtistCertificationFailures`.
 * Until one does, `selectFeaturedArtist` returns the demo artist it is given.
 *
 * What a record must carry:
 * - The artist's opt-in in their own words, when they gave it and where.
 * - A rights entry for every image the slot shows (avatar, every release, the
 *   inspected release): who holds it and on what basis we may show it.
 * - Every real person visible in those images, by their id in
 *   `scripts/invariants/art-direction/approved-people.json`. The art-direction
 *   rule keeps every real person off `/` (Tim, 2026-10-26), so on the homepage
 *   this list must be empty: cover art and artwork, no photos of people. Only
 *   Tim can change that rule.
 * - A confirmation that the slot shows no testimonials, follower counts,
 *   revenue or other performance claims the artist did not approve.
 */

export interface FeaturedArtistRelease {
  readonly title: string;
  readonly byline: string;
  readonly year: string;
  readonly src: string;
}

/** What the homepage product mockups draw for the featured artist. */
export interface FeaturedArtistProfile {
  /** True for an invented artist. Real, opted-in artists are `false`. */
  readonly demo: boolean;
  readonly slug: string;
  readonly name: string;
  readonly handle: string;
  readonly profileDisplay: string;
  readonly avatarSrc: string;
  /** Newest first. */
  readonly releases: readonly FeaturedArtistRelease[];
  /** The release the product mockups open in the inspector and release page. */
  readonly inspected: {
    readonly title: string;
    readonly src: string;
    readonly date: string;
    readonly type: string;
    readonly tracks: string;
    readonly duration: string;
    readonly genres: readonly string[];
    readonly label: string;
    readonly upc: string;
  };
}

export interface FeaturedArtistImageRights {
  readonly src: string;
  readonly holder: string;
  readonly basis: 'artist-owned' | 'licensed-to-artist';
}

export interface FeaturedArtistCertification {
  readonly certifiedAt: string;
  readonly imageRights: readonly FeaturedArtistImageRights[];
  /** approved-people ids for every real person visible in the images.
   * Must be empty while `/` admits no real person. */
  readonly peopleInImages: readonly string[];
  readonly noUnapprovedClaims: true;
}

export interface FeaturedArtistOptIn {
  readonly artist: FeaturedArtistProfile & { readonly demo: false };
  readonly optIn: {
    readonly at: string;
    /** The artist's own words agreeing to be featured. */
    readonly inArtistsWords: string;
    /** Where they said it (an email, a form in their account). */
    readonly source: string;
  };
  /** Lower ranks are featured first. */
  readonly rank: number;
  /** Null until the content is certified. */
  readonly certification: FeaturedArtistCertification | null;
}

/**
 * Real artists who opted in to be featured. Empty until the first one does;
 * every entry must pass `featuredArtistCertificationFailures`.
 */
export const FEATURED_ARTIST_OPT_INS: readonly FeaturedArtistOptIn[] = [];

const LOCAL_IMAGE = /^\/[\w\-./]+\.(webp|png|jpe?g|avif)$/;

function isDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}/.test(value) && !Number.isNaN(Date.parse(value));
}

/** Every image the featured slot draws for this artist. */
export function featuredArtistImages(
  artist: FeaturedArtistProfile
): readonly string[] {
  return [
    ...new Set([
      artist.avatarSrc,
      ...artist.releases.map(release => release.src),
      artist.inspected.src,
    ]),
  ];
}

/** Why an opt-in may not be featured yet. Empty means certified. */
export function featuredArtistCertificationFailures(
  record: FeaturedArtistOptIn
): readonly string[] {
  const failures: string[] = [];
  const { artist, optIn, certification } = record;

  if (artist.demo !== false) failures.push('artist is marked as demo');
  if (!optIn.inArtistsWords.trim()) {
    failures.push('opt-in is missing in the artist’s own words');
  }
  if (!optIn.source.trim()) failures.push('opt-in has no source');
  if (!isDate(optIn.at)) failures.push('opt-in has no valid date');
  if (artist.releases.length === 0) failures.push('artist has no releases');
  if (!artist.releases.some(release => release.src === artist.inspected.src)) {
    failures.push('inspected release is not in the catalog');
  }
  if (!certification) {
    failures.push('content is not certified');
    return failures;
  }

  if (!isDate(certification.certifiedAt)) {
    failures.push('certification has no valid date');
  } else if (isDate(optIn.at) && certification.certifiedAt < optIn.at) {
    failures.push('content was certified before the artist opted in');
  }
  if (certification.noUnapprovedClaims !== true) {
    failures.push('unapproved claims are not ruled out');
  }

  if (certification.peopleInImages.length > 0) {
    failures.push(
      'images show a real person, and `/` admits no real person (Tim, 2026-10-26)'
    );
  }

  const rights = new Map(
    certification.imageRights.map(entry => [entry.src, entry])
  );
  for (const src of featuredArtistImages(artist)) {
    if (!LOCAL_IMAGE.test(src)) {
      failures.push(`image is not a local file: ${src}`);
    }
    const entry = rights.get(src);
    if (!entry) {
      failures.push(`no rights entry for ${src}`);
    } else if (!entry.holder.trim()) {
      failures.push(`rights entry has no holder for ${src}`);
    }
  }
  return failures;
}

/**
 * The artist a featured slot shows: the best-ranked certified opt-in, or the
 * demo artist when none is certified.
 */
export function selectFeaturedArtist<Fallback extends FeaturedArtistProfile>(
  optIns: readonly FeaturedArtistOptIn[],
  fallback: Fallback
): FeaturedArtistProfile {
  const certified = optIns
    .filter(record => featuredArtistCertificationFailures(record).length === 0)
    .sort((a, b) => a.rank - b.rank);
  return certified[0]?.artist ?? fallback;
}
