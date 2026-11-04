/**
 * Verify-everything fact contract (Tim, 2026-10-29).
 *
 * "Everything about an artist that we can find and verify should be found and
 * verified. Everything about a piece of work we can find and verify should be
 * found and verified."
 *
 * One registry entry per fact. Each entry names its source, the rule that makes
 * it verified, the confidence floor for showing it as true, the resolver /
 * entity-contract step that fills it (`jovie.entity-resolver/v1`), and its
 * golden-path tier: the order the artist first sees it.
 *
 * Coverage is a metric, not prose: per profile, the share of findable facts
 * that are found, and the share that are verified, overall and per tier.
 *
 * Display rule (never show an unsure fact as if it were true):
 * - verified  -> show
 * - found     -> ask the artist to confirm in one tap; never render as fact
 * - missing   -> hide (no placeholder, no dead end)
 *
 * Pure module. The coverage query is `scripts/verify-everything/coverage.sql`;
 * every SQL-backed field id below must appear there (enforced by test).
 */

export const FACT_CONTRACT_VERSION = 'jovie.verify-everything/v1' as const;

export type FactEntity = 'artist' | 'work';

/**
 * 1: shown inside the first 30 seconds (onboarding preview, the wow moment).
 * 2: shown on the claimed public profile and smart links.
 * 3: depth (release detail, credits, agent/API surfaces).
 */
export type GoldenPathTier = 1 | 2 | 3;

/**
 * always: every artist or work has this fact somewhere (a Spotify artist has an
 * id, a release has a date). Missing counts against coverage.
 * conditional: exists only for some (tour dates, lyrics, featured credits). It
 * joins the denominator only when a signal says it exists.
 */
export type Findability = 'always' | 'conditional';

/** found = we hold a value that did not pass the verification rule. */
export type FactState = 'verified' | 'found' | 'missing' | 'not_applicable';

export type FactDisplay = 'show' | 'confirm_one_tap' | 'hide';

export interface FactSpec {
  readonly id: string;
  readonly entity: FactEntity;
  readonly label: string;
  readonly tier: GoldenPathTier;
  readonly findability: Findability;
  /** Where the value comes from, most authoritative first. */
  readonly sources: readonly string[];
  /** What makes the value verified rather than merely found. */
  readonly verificationRule: string;
  /** Minimum calibrated confidence to render as true without owner confirmation. */
  readonly minConfidence: number;
  /** Resolver / entity-contract step that fills it. */
  readonly resolverStep: string;
  /**
   * `sql`: measured by coverage.sql today. `no_producer`: nothing fills it yet;
   * reported as a contract gap, excluded from the coverage denominator until a
   * producer ships so a zero is not mistaken for a measurement.
   */
  readonly producer: 'sql' | 'no_producer';
}

const IDENTITY_FLOOR = 0.85;

export const FACT_SPECS: readonly FactSpec[] = [
  // --- Artist, tier 1: the first 30 seconds --------------------------------
  {
    id: 'artist.spotify_identity',
    entity: 'artist',
    label: 'Spotify artist identity',
    tier: 1,
    findability: 'always',
    sources: ['spotify_api'],
    verificationRule:
      'Exact Spotify artist id resolved by id (not name search) with right-artist confidence >= 0.85, or the owner claimed the profile against that id.',
    minConfidence: IDENTITY_FLOOR,
    resolverStep: 'music-resolver/artist-identity-confidence (#23732)',
    producer: 'sql',
  },
  {
    id: 'artist.display_name',
    entity: 'artist',
    label: 'Artist name',
    tier: 1,
    findability: 'always',
    sources: ['spotify_api', 'owner'],
    verificationRule:
      'Equals the name the identity-verified DSP returns for the artist id, or owner-set.',
    minConfidence: IDENTITY_FLOOR,
    resolverStep: 'onboarding/confirm-artist tool',
    producer: 'sql',
  },
  {
    id: 'artist.avatar',
    entity: 'artist',
    label: 'Artist image',
    tier: 1,
    findability: 'always',
    sources: ['spotify_api', 'owner_upload'],
    verificationRule:
      'Fetched from the identity-verified DSP artist object, or uploaded by the owner.',
    minConfidence: IDENTITY_FLOOR,
    resolverStep: 'onboarding/confirm-artist tool',
    producer: 'sql',
  },
  {
    id: 'artist.catalog',
    entity: 'artist',
    label: 'Releases',
    tier: 1,
    findability: 'always',
    sources: ['spotify_api', 'deezer_api', 'apple_music_api'],
    verificationRule:
      'Releases fetched by the verified artist id (never by name), each with a UPC.',
    minConfidence: IDENTITY_FLOOR,
    resolverStep: 'onboarding/catalog-import (JOV-9758) + in-house resolver',
    producer: 'sql',
  },
  // --- Artist, tier 2: the claimed profile ---------------------------------
  ...(
    [
      ['apple_music', 'Apple Music identity'],
      ['youtube_music', 'YouTube Music identity'],
      ['deezer', 'Deezer identity'],
      ['tidal', 'TIDAL identity'],
      ['soundcloud', 'SoundCloud identity'],
      ['amazon_music', 'Amazon Music identity'],
    ] as const
  ).map(
    ([provider, label]): FactSpec => ({
      id: `artist.dsp.${provider}`,
      entity: 'artist',
      label,
      tier: 2,
      findability: 'always',
      sources: ['isrc_upc_cross_match', 'musicfetch', 'owner'],
      verificationRule:
        'dsp_artist_matches confirmed or auto_confirmed with >= 1 matching ISRC/UPC, or owner-confirmed.',
      minConfidence: IDENTITY_FLOOR,
      resolverStep: 'dsp-enrichment/artist-match (ISRC/UPC cross-match)',
      producer: 'sql',
    })
  ),
  ...(
    [
      ['instagram', 'Instagram'],
      ['tiktok', 'TikTok'],
      ['youtube', 'YouTube channel'],
      ['x', 'X'],
    ] as const
  ).map(
    ([platform, label]): FactSpec => ({
      id: `artist.social.${platform}`,
      entity: 'artist',
      label,
      tier: 2,
      findability: 'conditional',
      sources: ['dsp_profile_links', 'musicfetch', 'linktree', 'owner'],
      verificationRule:
        'Link verification passed (backlink or token) or owner-confirmed. A link scraped from a third party is found, not verified.',
      minConfidence: IDENTITY_FLOOR,
      resolverStep: 'social-links/verification',
      producer: 'sql',
    })
  ),
  {
    id: 'artist.genres',
    entity: 'artist',
    label: 'Genres',
    tier: 2,
    findability: 'always',
    sources: ['spotify_api'],
    verificationRule: 'From the identity-verified DSP artist object.',
    minConfidence: IDENTITY_FLOOR,
    resolverStep: 'canonical-metrics snapshot',
    producer: 'sql',
  },
  {
    id: 'artist.bio',
    entity: 'artist',
    label: 'Bio',
    tier: 2,
    findability: 'always',
    sources: ['dsp_bio_sync', 'owner'],
    verificationRule: 'Owner-written or owner-approved. A synced bio is found.',
    minConfidence: 1,
    resolverStep: 'dsp-bio-sync',
    producer: 'sql',
  },
  {
    id: 'artist.location',
    entity: 'artist',
    label: 'Location',
    tier: 2,
    findability: 'always',
    sources: ['owner', 'musicbrainz'],
    verificationRule: 'Owner-confirmed.',
    minConfidence: 1,
    resolverStep: 'profile attributes',
    producer: 'sql',
  },
  {
    id: 'artist.labels',
    entity: 'artist',
    label: 'Labels',
    tier: 2,
    findability: 'always',
    sources: ['release_metadata'],
    verificationRule:
      'Derived from labels on identity-verified releases (any release with a label).',
    minConfidence: IDENTITY_FLOOR,
    resolverStep: 'catalog-import release metadata',
    producer: 'sql',
  },
  {
    id: 'artist.tour_dates',
    entity: 'artist',
    label: 'Tour dates',
    tier: 2,
    findability: 'conditional',
    sources: ['bandsintown', 'owner'],
    verificationRule:
      'Provider event confirmed (confirmation_status = confirmed) for the linked Bandsintown artist.',
    minConfidence: IDENTITY_FLOOR,
    resolverStep: 'tour-dates/bandsintown sync',
    producer: 'sql',
  },
  {
    id: 'artist.merch',
    entity: 'artist',
    label: 'Merch',
    tier: 2,
    findability: 'conditional',
    sources: ['jovie_merch', 'shop_link'],
    verificationRule: 'A live merch card or an owner-confirmed shop link.',
    minConfidence: 1,
    resolverStep: 'merch/service',
    producer: 'sql',
  },
  // --- Artist, tier 3: depth ------------------------------------------------
  {
    id: 'artist.musicbrainz',
    entity: 'artist',
    label: 'MusicBrainz id',
    tier: 3,
    findability: 'always',
    sources: ['musicbrainz'],
    verificationRule:
      'MBID whose recordings share >= 1 ISRC with the verified catalog.',
    minConfidence: IDENTITY_FLOOR,
    resolverStep: 'in-house resolver (mbid)',
    producer: 'sql',
  },
  {
    id: 'artist.followers',
    entity: 'artist',
    label: 'Spotify followers',
    tier: 3,
    findability: 'always',
    sources: ['spotify_api'],
    verificationRule: 'Read from spotify_api for the verified id.',
    minConfidence: IDENTITY_FLOOR,
    resolverStep: 'onboarding/enrichment-facts',
    producer: 'sql',
  },
  {
    id: 'artist.press',
    entity: 'artist',
    label: 'Press coverage',
    tier: 3,
    findability: 'conditional',
    sources: ['web_search', 'owner'],
    verificationRule:
      'Article names the artist and links a verified identity; owner-confirmed before display.',
    minConfidence: IDENTITY_FLOOR,
    resolverStep: 'none yet (entity kind web_identity)',
    producer: 'no_producer',
  },
  // --- Work (per release / recording, averaged per profile) ----------------
  {
    id: 'work.artwork_and_date',
    entity: 'work',
    label: 'Artwork and release date',
    tier: 1,
    findability: 'always',
    sources: ['spotify_api'],
    verificationRule: 'From the DSP release fetched by id.',
    minConfidence: IDENTITY_FLOOR,
    resolverStep: 'catalog-import',
    producer: 'sql',
  },
  {
    id: 'work.upc',
    entity: 'work',
    label: 'UPC',
    tier: 2,
    findability: 'always',
    sources: ['spotify_api', 'deezer_api'],
    verificationRule:
      'Valid GTIN check digit and returned by a DSP lookup of the release (#23749).',
    minConfidence: 1,
    resolverStep: 'music-resolver/catalog-upc-sources (#23749)',
    producer: 'sql',
  },
  {
    id: 'work.isrc',
    entity: 'work',
    label: 'ISRCs on every track',
    tier: 2,
    findability: 'always',
    sources: ['spotify_api', 'deezer_api'],
    verificationRule: 'Every track on the release carries an ISRC from a DSP.',
    minConfidence: 1,
    resolverStep: 'catalog-import tracks',
    producer: 'sql',
  },
  {
    id: 'work.dsp_links',
    entity: 'work',
    label: 'Smart link destinations',
    tier: 2,
    findability: 'always',
    sources: ['isrc_upc_lookup'],
    verificationRule:
      '>= 3 DSP destinations resolved by UPC/ISRC (identifier match, not title search).',
    minConfidence: IDENTITY_FLOOR,
    resolverStep: 'music-resolver/in-house (#23729)',
    producer: 'sql',
  },
  {
    id: 'work.label',
    entity: 'work',
    label: 'Label',
    tier: 3,
    findability: 'always',
    sources: ['spotify_api'],
    verificationRule: 'From the DSP release fetched by id.',
    minConfidence: IDENTITY_FLOOR,
    resolverStep: 'catalog-import',
    producer: 'sql',
  },
  {
    id: 'work.main_credit',
    entity: 'work',
    label: 'Main artist credit',
    tier: 3,
    findability: 'always',
    sources: ['spotify_api'],
    verificationRule:
      'release_artists main_artist row linked to the artist registry.',
    minConfidence: IDENTITY_FLOOR,
    resolverStep: 'catalog-names collaborator matching (#23749)',
    producer: 'sql',
  },
  {
    id: 'work.producer_credits',
    entity: 'work',
    label: 'Producer credits',
    tier: 3,
    findability: 'always',
    sources: ['musicbrainz', 'owner'],
    verificationRule:
      'Producer role on a recording, from MusicBrainz by ISRC or owner-confirmed.',
    minConfidence: IDENTITY_FLOOR,
    resolverStep: 'credits enrichment (by ISRC)',
    producer: 'sql',
  },
  {
    id: 'work.writer_credits',
    entity: 'work',
    label: 'Writer credits',
    tier: 3,
    findability: 'always',
    sources: ['musicbrainz', 'pro_registry', 'owner'],
    verificationRule:
      'Composer or lyricist role on a recording, by ISRC/ISWC or owner-confirmed.',
    minConfidence: IDENTITY_FLOOR,
    resolverStep: 'credits enrichment (by ISRC)',
    producer: 'sql',
  },
  {
    id: 'work.lyrics',
    entity: 'work',
    label: 'Lyrics available',
    tier: 3,
    findability: 'conditional',
    sources: ['lyrics_provider', 'owner'],
    verificationRule:
      'Lyrics stored for the recording, from a licensed provider or the owner.',
    minConfidence: 1,
    resolverStep: 'none beyond owner entry',
    producer: 'sql',
  },
  {
    id: 'work.iswc',
    entity: 'work',
    label: 'ISWC',
    tier: 3,
    findability: 'always',
    sources: ['musicbrainz', 'pro_registry'],
    verificationRule: 'ISWC linked to the recording ISRC by a registry.',
    minConfidence: 1,
    resolverStep: 'none yet (no column)',
    producer: 'no_producer',
  },
  {
    id: 'work.versions',
    entity: 'work',
    label: 'Linked versions (remix, live, sped up)',
    tier: 3,
    findability: 'conditional',
    sources: ['isrc_lineage', 'musicbrainz'],
    verificationRule:
      'Recordings grouped under one work by ISWC or MusicBrainz work id.',
    minConfidence: IDENTITY_FLOOR,
    resolverStep: 'none yet',
    producer: 'no_producer',
  },
];

export const FACT_SPEC_BY_ID: ReadonlyMap<string, FactSpec> = new Map(
  FACT_SPECS.map(spec => [spec.id, spec])
);

/** Never show an unsure fact as if it were true. */
export function factDisplay(
  state: FactState,
  confidence: number | null,
  spec: Pick<FactSpec, 'minConfidence'>
): FactDisplay {
  if (state === 'verified') {
    return confidence === null || confidence >= spec.minConfidence
      ? 'show'
      : 'confirm_one_tap';
  }
  if (state === 'found') return 'confirm_one_tap';
  return 'hide';
}

/**
 * One profile's observed states. Artist facts are one state each; work facts
 * are the per-release share in each state (0..1), because a profile has many
 * works.
 */
export interface ProfileFactObservation {
  readonly profileId: string;
  readonly artist: Readonly<Record<string, FactState>>;
  readonly work: Readonly<
    Record<
      string,
      {
        readonly verified: number;
        readonly found: number;
        readonly applicable: number;
      }
    >
  >;
}

export interface CoverageSlice {
  /** Findable facts in the denominator (weight units). */
  readonly findable: number;
  /** found or verified / findable, 0..1. Null when nothing is findable. */
  readonly foundShare: number | null;
  /** verified / findable, 0..1. */
  readonly verifiedShare: number | null;
}

export interface ProfileCoverage {
  readonly profileId: string;
  readonly overall: CoverageSlice;
  readonly byTier: Readonly<Record<GoldenPathTier, CoverageSlice>>;
  /** Facts in the denominator that are not verified, tier order first. */
  readonly gaps: readonly string[];
}

const round4 = (value: number): number => Math.round(value * 10_000) / 10_000;

function slice(
  findable: number,
  found: number,
  verified: number
): CoverageSlice {
  return {
    findable: round4(findable),
    foundShare: findable > 0 ? round4(found / findable) : null,
    verifiedShare: findable > 0 ? round4(verified / findable) : null,
  };
}

/**
 * Coverage = share of findable facts found / verified. A `conditional` fact
 * with state `not_applicable` stays out of the denominator; an `always` fact
 * never does. `no_producer` facts are excluded and reported separately.
 */
export function computeProfileCoverage(
  observation: ProfileFactObservation,
  specs: readonly FactSpec[] = FACT_SPECS
): ProfileCoverage {
  const totals = new Map<
    GoldenPathTier | 0,
    { f: number; fo: number; v: number }
  >();
  const add = (tier: GoldenPathTier, f: number, fo: number, v: number) => {
    for (const key of [tier, 0] as const) {
      const current = totals.get(key) ?? { f: 0, fo: 0, v: 0 };
      totals.set(key, {
        f: current.f + f,
        fo: current.fo + fo,
        v: current.v + v,
      });
    }
  };
  const gaps: { id: string; tier: GoldenPathTier }[] = [];

  for (const spec of specs) {
    if (spec.producer !== 'sql') continue;
    if (spec.entity === 'artist') {
      const raw = observation.artist[spec.id] ?? 'missing';
      const state: FactState =
        raw === 'not_applicable' && spec.findability === 'always'
          ? 'missing'
          : raw;
      if (state === 'not_applicable') continue;
      const verified = state === 'verified' ? 1 : 0;
      const found = state === 'verified' || state === 'found' ? 1 : 0;
      add(spec.tier, 1, found, verified);
      if (!verified) gaps.push({ id: spec.id, tier: spec.tier });
      continue;
    }
    const work = observation.work[spec.id];
    if (!work || work.applicable <= 0) {
      if (spec.findability === 'always') {
        // No works at all: the catalog fact already carries the miss.
        continue;
      }
      continue;
    }
    const verified = Math.min(1, Math.max(0, work.verified));
    const found = Math.min(1, Math.max(verified, work.found));
    add(spec.tier, 1, found, verified);
    if (verified < 1) gaps.push({ id: spec.id, tier: spec.tier });
  }

  const read = (key: GoldenPathTier | 0) => {
    const t = totals.get(key) ?? { f: 0, fo: 0, v: 0 };
    return slice(t.f, t.fo, t.v);
  };
  return {
    profileId: observation.profileId,
    overall: read(0),
    byTier: { 1: read(1), 2: read(2), 3: read(3) },
    gaps: gaps.sort((a, b) => a.tier - b.tier).map(gap => gap.id),
  };
}

export interface CoverageReport {
  readonly contract: typeof FACT_CONTRACT_VERSION;
  readonly profiles: number;
  /** Mean per-profile share; each profile counts once. */
  readonly meanFoundShare: number | null;
  readonly meanVerifiedShare: number | null;
  readonly byTier: Readonly<
    Record<
      GoldenPathTier,
      {
        readonly meanFoundShare: number | null;
        readonly meanVerifiedShare: number | null;
      }
    >
  >;
  /** Facts ranked by how many profiles miss verification, tier first. */
  readonly gapRanking: readonly {
    readonly id: string;
    readonly tier: GoldenPathTier;
    readonly profilesUnverified: number;
  }[];
  /** Contract facts with no producer yet (not in any denominator). */
  readonly noProducer: readonly string[];
}

const mean = (values: readonly (number | null)[]): number | null => {
  const present = values.filter((value): value is number => value !== null);
  return present.length > 0
    ? round4(present.reduce((sum, value) => sum + value, 0) / present.length)
    : null;
};

export function buildCoverageReport(
  observations: readonly ProfileFactObservation[],
  specs: readonly FactSpec[] = FACT_SPECS
): CoverageReport {
  const coverages = observations.map(observation =>
    computeProfileCoverage(observation, specs)
  );
  const gapCounts = new Map<string, number>();
  for (const coverage of coverages) {
    for (const id of coverage.gaps)
      gapCounts.set(id, (gapCounts.get(id) ?? 0) + 1);
  }
  const tierOf = (id: string): GoldenPathTier =>
    specs.find(spec => spec.id === id)?.tier ?? 3;
  const tierMeans = (tier: GoldenPathTier) => ({
    meanFoundShare: mean(coverages.map(c => c.byTier[tier].foundShare)),
    meanVerifiedShare: mean(coverages.map(c => c.byTier[tier].verifiedShare)),
  });
  return {
    contract: FACT_CONTRACT_VERSION,
    profiles: coverages.length,
    meanFoundShare: mean(coverages.map(c => c.overall.foundShare)),
    meanVerifiedShare: mean(coverages.map(c => c.overall.verifiedShare)),
    byTier: { 1: tierMeans(1), 2: tierMeans(2), 3: tierMeans(3) },
    gapRanking: [...gapCounts.entries()]
      .map(([id, profilesUnverified]) => ({
        id,
        tier: tierOf(id),
        profilesUnverified,
      }))
      .sort(
        (a, b) => a.tier - b.tier || b.profilesUnverified - a.profilesUnverified
      ),
    noProducer: specs
      .filter(spec => spec.producer === 'no_producer')
      .map(spec => spec.id),
  };
}
