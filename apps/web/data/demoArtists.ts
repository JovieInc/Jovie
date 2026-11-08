/**
 * Invented demo artists for marketing surfaces.
 *
 * Tim (2026-11-08): the homepage should not feature him. Until real artists
 * opt in to be featured, it shows invented artists with realistic-looking
 * profiles; then it switches to the top real artists who opt in, with their
 * content certified.
 *
 * Rules for every entry here:
 * - `demo: true`. Nothing in this file is a real person, artist, label or
 *   release. Swap a slot to a real artist only through an opt-in record.
 * - Names were searched before use and match no artist we could find.
 * - Imagery is drawn procedurally by `scripts/demo-artists/render-demo-covers.py`:
 *   no people, no faces, no text (approved-people.json: no real person on `/`).
 * - No testimonials, follower counts, revenue or other performance claims.
 * - Barcodes use the GS1 restricted-circulation prefix 2, which is never
 *   assigned to a real retail product.
 */

export interface DemoArtistRelease {
  readonly title: string;
  readonly byline: string;
  readonly year: string;
  readonly src: string;
}

export interface DemoArtist {
  readonly demo: true;
  readonly slug: string;
  readonly name: string;
  readonly handle: string;
  readonly profileDisplay: string;
  readonly avatarSrc: string;
  /** Newest first. */
  readonly releases: readonly DemoArtistRelease[];
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

const IVO = '/img/demo-artists/ivo-lindqvist';

export const DEMO_ARTIST_IVO_LINDQVIST: DemoArtist = {
  demo: true,
  slug: 'ivo-lindqvist',
  name: 'Ivo Lindqvist',
  handle: 'ivolindqvist',
  profileDisplay: 'jov.ie/ivolindqvist',
  avatarSrc: `${IVO}/avatar.jpg`,
  releases: [
    {
      title: 'Slow Weather',
      byline: 'Ivo Lindqvist',
      year: '2026',
      src: `${IVO}/slow-weather.jpg`,
    },
    {
      title: 'Night Ferry',
      byline: 'Club Mix · Ivo Lindqvist',
      year: '2025',
      src: `${IVO}/night-ferry.jpg`,
    },
    {
      title: 'Glass Coast',
      byline: 'Ivo Lindqvist',
      year: '2025',
      src: `${IVO}/glass-coast.jpg`,
    },
    {
      title: 'Paper Satellites',
      byline: 'Ivo Lindqvist',
      year: '2024',
      src: `${IVO}/paper-satellites.jpg`,
    },
    {
      title: 'Low Sun',
      byline: 'Ivo Lindqvist',
      year: '2024',
      src: `${IVO}/low-sun.jpg`,
    },
    {
      title: 'First Frost',
      byline: 'Ivo Lindqvist',
      year: '2023',
      src: `${IVO}/first-frost.jpg`,
    },
  ],
  inspected: {
    title: 'Low Sun',
    src: `${IVO}/low-sun.jpg`,
    date: 'Mar 6',
    type: 'Single',
    tracks: '1',
    duration: '3:41',
    genres: ['Melodic House', 'Ambient'],
    label: 'Self-released',
    upc: '2004183075211',
  },
};

/**
 * The artist the homepage features. A demo artist today; the opt-in featured
 * slot (real artists, certified content) replaces it later.
 */
export const HOMEPAGE_FEATURED_ARTIST: DemoArtist = DEMO_ARTIST_IVO_LINDQVIST;

/** True when a featured slot still shows an invented artist. */
export function isDemoArtist(artist: { readonly demo?: boolean }): boolean {
  return artist.demo === true;
}
