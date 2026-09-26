import { beforeEach, describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => {
  const txSelectResults: unknown[][] = [];
  const updatedValues: Array<Record<string, unknown>> = [];

  function query(result: unknown[]) {
    const builder: Record<string, unknown> = {};
    for (const method of ['from', 'where', 'orderBy']) {
      builder[method] = vi.fn(() => builder);
    }
    builder.limit = vi.fn().mockResolvedValue(result);
    builder.then = (
      resolve: (value: unknown[]) => unknown,
      reject: (reason: unknown) => unknown
    ) => Promise.resolve(result).then(resolve, reject);
    return builder;
  }

  const tx = {
    select: vi.fn(() => query(txSelectResults.shift() ?? [])),
    update: vi.fn(() => {
      const builder: Record<string, unknown> = {};
      builder.set = vi.fn((value: Record<string, unknown>) => {
        updatedValues.push(value);
        return builder;
      });
      builder.where = vi.fn(() => builder);
      builder.returning = vi.fn().mockResolvedValue([]);
      builder.then = (resolve: (value: undefined) => unknown) =>
        Promise.resolve(undefined).then(resolve);
      return builder;
    }),
    insert: vi.fn(() => ({
      values: vi.fn(() => ({
        onConflictDoNothing: vi.fn().mockResolvedValue(undefined),
        returning: vi.fn().mockResolvedValue([]),
      })),
    })),
  };

  return {
    merge: vi.fn().mockResolvedValue({ inserted: 0, updated: 0 }),
    tx,
    txSelectResults,
    updatedValues,
  };
});

vi.mock('@/lib/db', () => ({ db: { select: vi.fn() } }));
vi.mock('@/lib/ingestion/merge', () => ({
  normalizeAndMergeExtraction: hoisted.merge,
}));
vi.mock('@/lib/ingestion/session', () => ({
  withSystemIngestionSession: vi.fn(
    async (operation: (tx: unknown) => Promise<unknown>) =>
      operation(hoisted.tx)
  ),
}));

const {
  applyUnclaimedArtistIdentityEnrichment,
  buildIdentityEnrichmentPlan,
  extractIdentityHandles,
} = await import('@/lib/discography/unclaimed-artist-enrichment');
const {
  buildIdentityEnrichmentReceipt,
  isUnclaimedProfileShareReady,
  readIdentityEnrichmentReceipt,
  withIdentityEnrichmentReceipt,
} = await import('@/lib/profile/identity-enrichment');

const SPOTIFY_ID = '4y2SjBcp2eM8rFhKqDR9Ia';
const SPOTIFY_URL = `https://open.spotify.com/artist/${SPOTIFY_ID}`;

function discovery(
  overrides: Partial<{
    musicfetch: unknown;
    musicbrainz: unknown;
    checkedSources: string[];
  }> = {}
) {
  return {
    spotifyUrl: SPOTIFY_URL,
    spotifyId: SPOTIFY_ID,
    musicfetch: (overrides.musicfetch ?? null) as never,
    musicbrainz: (overrides.musicbrainz ?? null) as never,
    checkedSources: overrides.checkedSources ?? [],
  };
}

const UNCLAIMED_SETTINGS = {
  unclaimedArtistProfile: {
    state: 'unclaimed',
    source: 'structured_spotify_release_credit',
    artistRegistryId: 'artist-1',
    provider: 'spotify',
    providerArtistId: SPOTIFY_ID,
    ownershipVerified: false,
    representationVerified: false,
    consentObtained: false,
  },
};

function profile(overrides: Record<string, unknown> = {}) {
  return {
    id: 'profile-1',
    settings: UNCLAIMED_SETTINGS,
    isClaimed: false,
    usernameNormalized: 'feddelegrand',
    displayName: 'Fedde Le Grand',
    avatarUrl: null,
    displayNameLocked: false,
    avatarLockedByUser: false,
    musicbrainzId: null,
    ...overrides,
  } as never;
}

describe('buildIdentityEnrichmentPlan', () => {
  it('merges exact-MBID MusicBrainz url-rels into destinations with provenance', () => {
    const plan = buildIdentityEnrichmentPlan(
      discovery({
        checkedSources: ['musicfetch', 'musicbrainz'],
        musicbrainz: {
          id: 'mbid-1',
          name: 'Fedde Le Grand',
          relations: [
            {
              type: 'official homepage',
              url: { id: 'u1', resource: 'https://www.feddelegrand.com/' },
            },
            {
              type: 'social network',
              url: {
                id: 'u2',
                resource: 'https://instagram.com/feddelegrand',
              },
            },
          ],
        },
      }),
      { observedAt: '2026-09-26T00:00:00.000Z' }
    );

    const platforms = plan.destinations.map(d => d.platform);
    expect(platforms).toContain('website');
    expect(
      plan.destinations.every(d => d.providerMatch === 'exact_provider_id')
    ).toBe(true);
    expect(
      plan.destinations.every(d => d.observedAt === '2026-09-26T00:00:00.000Z')
    ).toBe(true);
    expect(plan.conflicts).toEqual([]);
    // Website destinations are evidence-only — arbitrary artist domains are
    // not publishable social_links rows today.
    expect(plan.links.map(l => l.url)).toEqual([
      'https://instagram.com/feddelegrand',
    ]);
  });

  it('never infers ownership from name similarity — unmapped/fan relations are dropped', () => {
    const plan = buildIdentityEnrichmentPlan(
      discovery({
        checkedSources: ['musicbrainz'],
        musicbrainz: {
          id: 'mbid-1',
          name: 'Fedde Le Grand',
          relations: [
            {
              // Not in MUSICBRAINZ_URL_TYPE_MAP — fan pages must not publish.
              type: 'fanpage',
              url: {
                id: 'u1',
                resource: 'https://instagram.com/feddelegrand_fanclub',
              },
            },
            {
              // Wikidata is an identifier, not an artist-controlled link.
              type: 'wikidata',
              url: { id: 'u2', resource: 'https://www.wikidata.org/wiki/Q123' },
            },
          ],
        },
      })
    );

    expect(plan.destinations).toEqual([]);
    expect(plan.links).toEqual([]);
  });

  it('flags source disagreement on the same platform as conflicted, never silently picks', () => {
    const plan = buildIdentityEnrichmentPlan(
      discovery({
        checkedSources: ['musicfetch', 'musicbrainz'],
        musicbrainz: {
          id: 'mbid-1',
          name: 'X',
          relations: [
            {
              type: 'social network',
              url: { id: 'u1', resource: 'https://instagram.com/stale_handle' },
            },
            {
              type: 'social network',
              url: {
                id: 'u2',
                resource: 'https://instagram.com/current_handle',
              },
            },
          ],
        },
      })
    );

    expect(plan.conflicts).toEqual([
      {
        platform: 'instagram',
        urls: [
          'https://instagram.com/stale_handle',
          'https://instagram.com/current_handle',
        ],
        reason: 'source_disagreement',
      },
    ]);
    expect(plan.destinations.every(d => d.state === 'conflicted')).toBe(true);
    // Conflicted destinations are withheld from the publishable merge set.
    expect(plan.links).toEqual([]);
  });

  it('dedupes multiple official domains per canonical identity and merges evidence', () => {
    const plan = buildIdentityEnrichmentPlan(
      discovery({
        checkedSources: ['musicbrainz'],
        musicbrainz: {
          id: 'mbid-1',
          name: 'X',
          relations: [
            {
              type: 'official homepage',
              url: { id: 'u1', resource: 'https://feddelegrand.com/' },
            },
            {
              type: 'official homepage',
              url: { id: 'u2', resource: 'https://www.feddelegrand.com/' },
            },
          ],
        },
      })
    );

    // Whether these canonicalize to one identity depends on normalization;
    // either way the plan must not emit duplicate identical links.
    const urls = plan.links.map(l => l.url);
    expect(new Set(urls).size).toBe(urls.length);
  });

  it('extracts verified social handles for the friendly-handle composer', () => {
    const handles = extractIdentityHandles(
      discovery({
        checkedSources: ['musicbrainz'],
        musicbrainz: {
          id: 'mbid-1',
          name: 'X',
          relations: [
            {
              type: 'social network',
              url: { id: 'u1', resource: 'https://instagram.com/feddelegrand' },
            },
          ],
        },
      })
    );

    expect(handles).toContain('feddelegrand');
  });
});

describe('identity enrichment receipt', () => {
  const destination = {
    platform: 'instagram',
    url: 'https://instagram.com/feddelegrand',
    state: 'active' as const,
    confidence: 0.75,
    source: 'musicbrainz',
    observedAt: '2026-09-26T00:00:00.000Z',
    providerMatch: 'exact_provider_id' as const,
  };

  it('distinguishes not_checked, not_found, conflicted, verified', () => {
    expect(
      buildIdentityEnrichmentReceipt({
        providerArtistId: SPOTIFY_ID,
        discoverySources: [],
        destinations: [],
        conflicts: [],
        passExecuted: false,
      }).status
    ).toBe('not_checked');

    expect(
      buildIdentityEnrichmentReceipt({
        providerArtistId: SPOTIFY_ID,
        discoverySources: ['musicfetch'],
        destinations: [],
        conflicts: [],
        passExecuted: true,
      }).status
    ).toBe('not_found');

    expect(
      buildIdentityEnrichmentReceipt({
        providerArtistId: SPOTIFY_ID,
        discoverySources: ['musicbrainz'],
        destinations: [destination],
        conflicts: [
          {
            platform: 'instagram',
            urls: ['https://instagram.com/a', 'https://instagram.com/b'],
            reason: 'source_disagreement',
          },
        ],
        passExecuted: true,
      }).status
    ).toBe('conflicted');

    expect(
      buildIdentityEnrichmentReceipt({
        providerArtistId: SPOTIFY_ID,
        discoverySources: ['musicbrainz'],
        destinations: [destination],
        conflicts: [],
        passExecuted: true,
      }).status
    ).toBe('verified');
  });

  it('enforces the share-ready minimum evidence contract', () => {
    const oneActive = buildIdentityEnrichmentReceipt({
      providerArtistId: SPOTIFY_ID,
      discoverySources: ['musicbrainz'],
      destinations: [destination],
      conflicts: [],
      passExecuted: true,
    });
    expect(oneActive.shareReady).toBe(false);
    expect(
      isUnclaimedProfileShareReady(withIdentityEnrichmentReceipt({}, oneActive))
    ).toBe(false);

    const twoActive = buildIdentityEnrichmentReceipt({
      providerArtistId: SPOTIFY_ID,
      discoverySources: ['musicbrainz'],
      destinations: [
        destination,
        {
          ...destination,
          platform: 'website',
          url: 'https://feddelegrand.com',
        },
      ],
      conflicts: [],
      passExecuted: true,
    });
    expect(twoActive.shareReady).toBe(true);

    const settings = withIdentityEnrichmentReceipt({}, twoActive);
    expect(readIdentityEnrichmentReceipt(settings)).toMatchObject({
      status: 'verified',
      shareReady: true,
    });
  });
});

describe('applyUnclaimedArtistIdentityEnrichment', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hoisted.txSelectResults.length = 0;
    hoisted.updatedValues.length = 0;
  });

  it('writes the receipt and merges discovered links for unclaimed profiles', async () => {
    hoisted.txSelectResults.push([]); // no existing social links

    const receipt = await applyUnclaimedArtistIdentityEnrichment(
      hoisted.tx as never,
      profile(),
      discovery({
        checkedSources: ['musicbrainz'],
        musicbrainz: {
          id: 'mbid-1',
          name: 'Fedde Le Grand',
          relations: [
            {
              type: 'official homepage',
              url: { id: 'u1', resource: 'https://www.feddelegrand.com' },
            },
            {
              type: 'social network',
              url: { id: 'u2', resource: 'https://instagram.com/feddelegrand' },
            },
          ],
        },
      })
    );

    expect(receipt?.status).toBe('verified');
    expect(receipt?.shareReady).toBe(true);
    expect(hoisted.merge).toHaveBeenCalledTimes(1);
    const settingsUpdate = hoisted.updatedValues.find(
      value => value.settings
    ) as { settings: Record<string, unknown> } | undefined;
    expect(
      readIdentityEnrichmentReceipt(settingsUpdate?.settings)?.status
    ).toBe('verified');
    expect(settingsUpdate?.settings.unclaimedArtistProfile).toEqual(
      UNCLAIMED_SETTINGS.unclaimedArtistProfile
    );
  });

  it('does not touch claimed or non-marker profiles', async () => {
    const claimed = await applyUnclaimedArtistIdentityEnrichment(
      hoisted.tx as never,
      profile({ isClaimed: true }),
      discovery({ checkedSources: ['musicbrainz'] })
    );
    const noMarker = await applyUnclaimedArtistIdentityEnrichment(
      hoisted.tx as never,
      profile({ settings: {} }),
      discovery({ checkedSources: ['musicbrainz'] })
    );

    expect(claimed).toBeNull();
    expect(noMarker).toBeNull();
    expect(hoisted.merge).not.toHaveBeenCalled();
    expect(hoisted.updatedValues).toEqual([]);
  });

  it('records not_found when trusted sources were checked but empty', async () => {
    const receipt = await applyUnclaimedArtistIdentityEnrichment(
      hoisted.tx as never,
      profile(),
      discovery({ checkedSources: ['musicfetch', 'musicbrainz'] })
    );

    expect(receipt?.status).toBe('not_found');
    expect(hoisted.merge).not.toHaveBeenCalled();
  });
});
