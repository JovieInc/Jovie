/**
 * Synthetic artist fixtures for the Jovie helpfulness eval.
 *
 * Fictional artists only, no real people or customer data. Dates are relative
 * to the run clock so "my song comes out Friday" stays true on every run.
 */

export type FixtureId = 'established' | 'new' | 'lapsed';

export interface EvalArtistContext {
  readonly displayName: string;
  readonly username: string;
  readonly bio: string | null;
  readonly genres: string[];
  readonly spotifyFollowers: number | null;
  readonly spotifyPopularity: number | null;
  readonly spotifyUrl: string | null;
  readonly appleMusicUrl: string | null;
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

export interface EvalRelease {
  readonly id: string;
  readonly title: string;
  readonly releaseType: string;
  readonly releaseDate: string | null;
  readonly totalTracks: number;
  readonly artworkUrl: string | null;
  readonly spotifyPopularity: number | null;
  readonly metadata: Record<string, unknown> | null;
  readonly canvasStatus: 'not_set' | 'generated' | 'uploaded';
}

export interface EvalFixture {
  readonly id: FixtureId;
  readonly artist: EvalArtistContext;
  readonly releases: readonly EvalRelease[];
  /** Plain-language facts handed to the judge so it can check grounding. */
  readonly facts: readonly string[];
  /** Stub result for showTopInsights. */
  readonly insights: unknown;
}

const DAY_MS = 86_400_000;

/** Next Friday strictly after `now` (UTC), at 00:00. */
export function nextFriday(now: Date): Date {
  const d = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
  );
  const delta = (5 - d.getUTCDay() + 7) % 7 || 7;
  return new Date(d.getTime() + delta * DAY_MS);
}

function daysFrom(now: Date, days: number): string {
  return new Date(now.getTime() + days * DAY_MS).toISOString();
}

function release(
  id: string,
  title: string,
  releaseType: string,
  releaseDate: string,
  totalTracks: number,
  spotifyPopularity: number | null
): EvalRelease {
  return {
    id,
    title,
    releaseType,
    releaseDate,
    totalTracks,
    artworkUrl: null,
    spotifyPopularity,
    metadata: null,
    canvasStatus: 'not_set',
  };
}

export function buildFixture(id: FixtureId, now: Date): EvalFixture {
  if (id === 'new') {
    return {
      id,
      artist: {
        displayName: 'Mara Quill',
        username: 'maraquill',
        bio: null,
        genres: [],
        spotifyFollowers: null,
        spotifyPopularity: null,
        spotifyUrl: null,
        appleMusicUrl: null,
        profileViews: 0,
        hasSocialLinks: false,
        hasMusicLinks: false,
        tippingStats: {
          tipClicks: 0,
          tipsSubmitted: 0,
          totalReceivedCents: 0,
          monthReceivedCents: 0,
        },
      },
      releases: [],
      facts: [
        'Artist Mara Quill (@maraquill), profile jov.ie/maraquill.',
        'No releases in the catalog, no bio, no genres, no Spotify connection, no social or music links, 0 profile views, no tips.',
      ],
      insights: { insights: [], relevant: false },
    };
  }

  if (id === 'lapsed') {
    return {
      id,
      artist: {
        displayName: 'Harbor Static',
        username: 'harborstatic',
        bio: 'Indie rock four-piece from Leeds.',
        genres: ['indie rock', 'post-punk'],
        spotifyFollowers: 4100,
        spotifyPopularity: 22,
        spotifyUrl: 'https://open.spotify.com/artist/eval-harbor-static',
        appleMusicUrl: null,
        profileViews: 610,
        hasSocialLinks: true,
        hasMusicLinks: true,
        tippingStats: {
          tipClicks: 3,
          tipsSubmitted: 0,
          totalReceivedCents: 0,
          monthReceivedCents: 0,
        },
      },
      releases: [
        release(
          'rel-lap-1',
          'Low Tide Choir',
          'single',
          daysFrom(now, -128),
          1,
          14
        ),
        release('rel-lap-2', 'Signal Fires', 'ep', daysFrom(now, -301), 5, 19),
      ],
      facts: [
        'Harbor Static (@harborstatic), profile jov.ie/harborstatic. Bio: "Indie rock four-piece from Leeds." Genres: indie rock, post-punk.',
        '4,100 Spotify followers, popularity 22/100, 610 profile views, 3 tip clicks, 0 tips.',
        'Latest release: single "Low Tide Choir", released about 128 days ago (popularity 14). Before that: EP "Signal Fires", about 301 days ago.',
        'No upcoming release scheduled.',
      ],
      insights: {
        insights: [
          {
            title: 'Profile visits down 38% over 30 days',
            evidence:
              '610 lifetime views; 41 in the last 30 days vs 66 the 30 before.',
          },
        ],
        relevant: true,
      },
    };
  }

  const friday = nextFriday(now);
  return {
    id,
    artist: {
      displayName: 'Luna Waves',
      username: 'lunawaves',
      bio: 'Ambient electronic producer from Portland.',
      genres: ['ambient', 'electronic', 'downtempo'],
      spotifyFollowers: 12500,
      spotifyPopularity: 45,
      spotifyUrl: 'https://open.spotify.com/artist/eval-luna-waves',
      appleMusicUrl: 'https://music.apple.com/artist/eval-luna-waves',
      profileViews: 3200,
      hasSocialLinks: true,
      hasMusicLinks: true,
      tippingStats: {
        tipClicks: 42,
        tipsSubmitted: 8,
        totalReceivedCents: 15000,
        monthReceivedCents: 2500,
      },
    },
    releases: [
      release(
        'rel-est-1',
        'Night Swim',
        'single',
        friday.toISOString(),
        1,
        null
      ),
      release('rel-est-2', 'Neon Reef', 'single', daysFrom(now, -58), 1, 38),
      release('rel-est-3', 'Tidal Drift', 'album', daysFrom(now, -170), 10, 41),
      release('rel-est-4', 'Coral EP', 'ep', daysFrom(now, -290), 4, 33),
    ],
    facts: [
      'Luna Waves (@lunawaves), profile jov.ie/lunawaves. Bio: "Ambient electronic producer from Portland." Genres: ambient, electronic, downtempo.',
      '12,500 Spotify followers, popularity 45/100, 3,200 profile views.',
      'Tips: 42 tip-link clicks, 8 tips, $150 total, $25 this month.',
      `UPCOMING: single "Night Swim" releases this Friday (${friday.toISOString().slice(0, 10)}).`,
      'Released: single "Neon Reef" ~58 days ago (popularity 38), album "Tidal Drift" ~170 days ago (popularity 41, 10 tracks), "Coral EP" ~290 days ago.',
      'Jovie has no daily stream counts; it sees Spotify followers/popularity, profile views, link clicks and tips.',
    ],
    insights: {
      insights: [
        {
          title: 'Instagram drives 61% of profile visits',
          evidence:
            '1,950 of 3,200 profile views came from the Instagram bio link.',
        },
        {
          title: 'Tip conversion 19%',
          evidence: '8 tips from 42 tip-link clicks.',
        },
      ],
      relevant: true,
    },
  };
}
