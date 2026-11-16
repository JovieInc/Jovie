/**
 * The opt-in featured slot on marketing surfaces.
 *
 * Tim (2026-11-12): feature him, with his own catalog, for now, and keep the
 * slot ready for any artist's data so it can rotate by what converts. The
 * slot shows the best-ranked opted-in artist whose content is certified, and
 * the labeled example artist in `demoArtists.ts` when none is.
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
 *   `scripts/invariants/art-direction/approved-people.json`. The only person
 *   a slot may show is the artist themselves (`artistPersonId`), and only
 *   images the registry admits on `/` with their own approval. Anyone else in
 *   an image keeps the slot off the homepage.
 * - A confirmation that the slot shows no testimonials, follower counts,
 *   revenue or other performance claims the artist did not approve.
 */

import { TIM_WHITE_PROFILE } from '@/lib/tim-white';

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
   * Only the artist themselves (`artistPersonId`) may appear. */
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
  /**
   * The artist's own id in approved-people.json, when their photos may show
   * in the slot. Nobody else may appear in the images.
   */
  readonly artistPersonId?: string;
  /** Null until the content is certified. */
  readonly certification: FeaturedArtistCertification | null;
}

const TIM_RELEASES = '/img/releases';

/**
 * Tim White, Jovie's founder, featured with his own catalog until other
 * artists opt in. Tim (2026-11-12): use him for now, and keep the slot ready
 * for other artists' data so the featured artist can rotate by what converts.
 */
export const FEATURED_ARTIST_TIM_WHITE: FeaturedArtistOptIn = {
  rank: 0,
  artistPersonId: 'tim-white',
  artist: {
    demo: false,
    slug: 'tim-white',
    name: TIM_WHITE_PROFILE.name,
    handle: TIM_WHITE_PROFILE.publicProfileHandle,
    profileDisplay: TIM_WHITE_PROFILE.publicProfileDisplay,
    avatarSrc: TIM_WHITE_PROFILE.avatarSrc,
    releases: [
      {
        title: 'Never Say A Word',
        byline: 'Tim White',
        year: '2024',
        src: `${TIM_RELEASES}/never-say-a-word.jpg`,
      },
      {
        title: 'Take Me Over',
        byline: 'Austin Leeds Remix · Tim White',
        year: '2024',
        src: `${TIM_RELEASES}/take-me-over-remix.webp`,
      },
      {
        title: 'Doge (To Mars)',
        byline: 'Tim White',
        year: '2021',
        src: `${TIM_RELEASES}/doge-to-mars.webp`,
      },
      {
        title: 'Tomorrow Sounds',
        byline: 'Tim White',
        year: '2020',
        src: `${TIM_RELEASES}/tomorrow-sounds.jpg`,
      },
      {
        title: 'Supernova Girl',
        byline: 'Tim White',
        year: '2020',
        src: `${TIM_RELEASES}/supernova-girl.webp`,
      },
      {
        title: 'This Is Love',
        byline: 'Tim White',
        year: '2020',
        src: `${TIM_RELEASES}/this-is-love.webp`,
      },
    ],
    inspected: {
      title: 'Supernova Girl',
      src: `${TIM_RELEASES}/supernova-girl.webp`,
      date: 'Mar 6',
      type: 'Single',
      tracks: '1',
      duration: '2:34',
      genres: ['Melodic Techno', 'Trance'],
      label: 'The Bubblegum Factory',
      upc: '5054526843813',
    },
  },
  optIn: {
    at: '2026-11-12T19:58:13Z',
    inArtistsWords:
      'approve new hero. use me for now. but the system should be ready to handle other data too. so we can start rotating demo artists based on what converts later.',
    source: 'Tim, in the Jovie project chat with Claude',
  },
  certification: {
    certifiedAt: '2026-11-12T20:10:00Z',
    imageRights: [
      TIM_WHITE_PROFILE.avatarSrc,
      `${TIM_RELEASES}/never-say-a-word.jpg`,
      `${TIM_RELEASES}/take-me-over-remix.webp`,
      `${TIM_RELEASES}/doge-to-mars.webp`,
      `${TIM_RELEASES}/tomorrow-sounds.jpg`,
      `${TIM_RELEASES}/supernova-girl.webp`,
      `${TIM_RELEASES}/this-is-love.webp`,
    ].map(src => ({
      src,
      holder: 'Tim White',
      basis: 'artist-owned' as const,
    })),
    // His avatar and the Never Say A Word cover are photos of him.
    peopleInImages: ['tim-white'],
    noUnapprovedClaims: true,
  },
};

/**
 * Real artists who opted in to be featured, best first. Every entry must pass
 * `featuredArtistCertificationFailures`; the lowest certified rank shows.
 */
export const FEATURED_ARTIST_OPT_INS: readonly FeaturedArtistOptIn[] = [
  FEATURED_ARTIST_TIM_WHITE,
];

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

  const others = certification.peopleInImages.filter(
    person => person !== record.artistPersonId
  );
  if (others.length > 0) {
    failures.push(
      `images show someone other than the artist (${others.join(', ')}); \`/\` admits only the featured artist`
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
