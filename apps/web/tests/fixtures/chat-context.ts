/**
 * Shared test fixture factories for Jovie AI chat tests.
 *
 * Used by both eval runners (tests/eval/) and unit tests (tests/unit/chat/).
 * Always returns complete objects to prevent runtime errors from missing keys.
 */

interface ArtistContext {
  readonly displayName: string;
  readonly username: string;
  readonly bio: string | null;
  readonly genres: string[];
  readonly spotifyFollowers: number | null;
  readonly spotifyPopularity: number | null;
  readonly profileViews: number;
  readonly hasSocialLinks: boolean;
  readonly hasMusicLinks: boolean;
  readonly tippingStats: {
    readonly tipClicks: number;
    readonly tipsSubmitted: number;
    readonly totalReceivedCents: number;
    readonly monthReceivedCents: number;
  };
}

interface ReleasePromptContext {
  readonly title: string;
  readonly releaseType: string;
  readonly releaseDate: string | null;
  readonly totalTracks: number;
}

const DEFAULT_ARTIST_CONTEXT: ArtistContext = {
  displayName: 'Luna Waves',
  username: 'lunawaves',
  bio: 'Ambient electronic producer from Portland.',
  genres: ['ambient', 'electronic', 'downtempo'],
  spotifyFollowers: 12500,
  spotifyPopularity: 45,
  profileViews: 3200,
  hasSocialLinks: true,
  hasMusicLinks: true,
  tippingStats: {
    tipClicks: 42,
    tipsSubmitted: 8,
    totalReceivedCents: 15000,
    monthReceivedCents: 2500,
  },
};

const DEFAULT_RELEASES: ReleasePromptContext[] = [
  {
    title: 'Tidal Drift',
    releaseType: 'album',
    releaseDate: '2025-06-15T00:00:00Z',
    totalTracks: 10,
  },
  {
    title: 'Neon Reef',
    releaseType: 'single',
    releaseDate: '2025-09-01T00:00:00Z',
    totalTracks: 1,
  },
  {
    title: 'Coral EP',
    releaseType: 'ep',
    releaseDate: '2025-03-20T00:00:00Z',
    totalTracks: 4,
  },
];

/**
 * Build a complete ArtistContext with sensible defaults.
 * Pass overrides to customize specific fields.
 */
export function buildTestArtistContext(
  overrides?: Partial<ArtistContext>
): ArtistContext {
  return {
    ...DEFAULT_ARTIST_CONTEXT,
    ...overrides,
    tippingStats: {
      ...DEFAULT_ARTIST_CONTEXT.tippingStats,
      ...(overrides?.tippingStats ?? {}),
    },
  };
}

/**
 * Build test releases with optional overrides.
 */
export function buildTestReleases(
  overrides?: Partial<ReleasePromptContext>[]
): ReleasePromptContext[] {
  if (!overrides) return DEFAULT_RELEASES;
  return overrides.map((o, i) => ({
    ...(DEFAULT_RELEASES[i] ?? DEFAULT_RELEASES[0]),
    ...o,
  }));
}

/**
 * Build a new-artist context with zero data.
 * Useful for testing empty/zero-state edge cases.
 */
export function buildNewArtistContext(): ArtistContext {
  return {
    displayName: 'New Artist',
    username: 'newartist',
    bio: null,
    genres: [],
    spotifyFollowers: null,
    spotifyPopularity: null,
    profileViews: 0,
    hasSocialLinks: false,
    hasMusicLinks: false,
    tippingStats: {
      tipClicks: 0,
      tipsSubmitted: 0,
      totalReceivedCents: 0,
      monthReceivedCents: 0,
    },
  };
}
