import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  compareResolverResults,
  MUSIC_RESOLVER_PARITY_CORPUS,
  type MusicResolverInput,
  musicResolverInputKey,
  musicResolverInputSchema,
  type ResolverOutput,
  runMusicResolverParityCorpus,
  runMusicResolverShadow,
} from './shadow';

vi.mock('server-only', () => ({}));

const selectQueue = vi.hoisted(() => ({ rows: [] as unknown[][] }));
const selectDistinctQueue = vi.hoisted(() => ({ rows: [] as unknown[][] }));
const mockSelect = vi.hoisted(() => vi.fn());
const mockSelectDistinct = vi.hoisted(() => vi.fn());
const mockInsert = vi.hoisted(() => vi.fn());
const mockResolveAgentRelease = vi.hoisted(() => vi.fn());
const mockMusicfetchLookupByIsrc = vi.hoisted(() => vi.fn());
const mockLookupAppleMusicByIsrc = vi.hoisted(() => vi.fn());
const mockLookupDeezerByIsrc = vi.hoisted(() => vi.fn());
const mockGetReleaseById = vi.hoisted(() => vi.fn());
const mockValidateProviderUrl = vi.hoisted(() => vi.fn());
const mockGetRegistryEntry = vi.hoisted(() => vi.fn());

vi.mock('@/lib/db', () => ({
  db: {
    select: mockSelect,
    selectDistinct: mockSelectDistinct,
    insert: mockInsert,
  },
}));
vi.mock('@/lib/agent-acquisition/release-resolution', () => ({
  resolveAgentRelease: mockResolveAgentRelease,
}));
vi.mock('@/lib/discography/musicfetch', () => ({
  lookupByIsrc: mockMusicfetchLookupByIsrc,
}));
vi.mock('@/lib/discography/provider-links', () => ({
  lookupAppleMusicByIsrc: mockLookupAppleMusicByIsrc,
  lookupDeezerByIsrc: mockLookupDeezerByIsrc,
}));
vi.mock('@/lib/discography/queries', () => ({
  getReleaseById: mockGetReleaseById,
}));
vi.mock('@/lib/discography/provider-domains', () => ({
  validateProviderUrl: mockValidateProviderUrl,
}));
vi.mock('@/lib/dsp-registry', () => ({
  getRegistryEntry: mockGetRegistryEntry,
}));

const chain = (result: unknown[]) => ({
  from: vi.fn().mockReturnThis(),
  innerJoin: vi.fn().mockReturnThis(),
  leftJoin: vi.fn().mockReturnThis(),
  where: vi.fn().mockReturnThis(),
  limit: vi.fn().mockResolvedValue(result),
});

const urlInput = {
  kind: 'url',
  url: 'https://open.spotify.com/track/4bc0TJNIiGEJjFYDwHuOjX',
  territory: 'US',
} as const satisfies Record<string, unknown>;

// The cached-receipt branch widens the return type through jsonb; narrow it.
type ShadowReceipt = {
  version: number;
  corpusSeedId: string | null;
  failureBehavior: { jovie: string; musicfetch: string };
  comparison: ReturnType<typeof compareResolverResults>;
  cost: { jovie: number; musicfetch: number };
  results: { jovie: ResolverOutput; musicfetch: ResolverOutput };
};

const runShadow = (input: MusicResolverInput, corpusSeedId?: string) =>
  runMusicResolverShadow({ corpusSeedId, input }) as Promise<ShadowReceipt>;

const resolved = (providers: Record<string, string>) => ({
  status: 'resolved' as const,
  providers,
  provenance: {},
  confidence: 1,
  requestCount: 1,
});

beforeEach(() => {
  vi.clearAllMocks();
  selectQueue.rows = [];
  selectDistinctQueue.rows = [];
  mockSelect.mockImplementation(() => chain(selectQueue.rows.shift() ?? []));
  mockSelectDistinct.mockImplementation(() =>
    chain(selectDistinctQueue.rows.shift() ?? [])
  );
  mockInsert.mockImplementation(() => ({
    values: vi.fn(() => ({
      onConflictDoUpdate: vi.fn().mockResolvedValue(undefined),
    })),
  }));
  mockResolveAgentRelease.mockResolvedValue({
    status: 'error',
    code: 'RELEASE_NOT_FOUND',
    retryable: false,
  });
  mockMusicfetchLookupByIsrc.mockResolvedValue(null);
  mockLookupAppleMusicByIsrc.mockResolvedValue(null);
  mockLookupDeezerByIsrc.mockResolvedValue(null);
  mockGetReleaseById.mockResolvedValue(null);
  mockValidateProviderUrl.mockImplementation((url: string) => ({
    valid: url.startsWith('https://'),
  }));
  mockGetRegistryEntry.mockImplementation((id: string) =>
    id === 'ghost' ? null : { key: id }
  );
});

describe('music resolver shadow contract', () => {
  it('normalizes and fingerprints every input kind deterministically', () => {
    const parsed = JSON.parse(
      '[{"kind":"url","url":"https://example.com/track/1"},{"kind":"isrc","isrc":"usaaa2600001"},{"kind":"upc","upc":"00123456789012"},{"kind":"metadata","artist":"Tim White","title":"Take Me Over"},{"kind":"jovie","entityType":"release","id":"84b9af39-d740-4106-bdf0-09764ba825e2"}]'
    ).map((value: unknown) => musicResolverInputSchema.parse(value));
    expect(parsed.map((value: { kind: string }) => value.kind)).toHaveLength(5);
    expect(musicResolverInputKey(parsed[0])).toHaveLength(64);
    expect(parsed[1]).toMatchObject({ isrc: 'USAAA2600001', territory: 'US' });
  });

  it('preserves URL disagreements for adjudication without choosing Musicfetch as truth', () => {
    const comparison = compareResolverResults(
      resolved({ spotify: 'https://open.spotify.com/track/jovie' }),
      resolved({ spotify: 'https://open.spotify.com/track/musicfetch' })
    );
    expect(comparison).toMatchObject({
      status: 'disagreement',
      adjudication: 'pending',
      falsePositiveRate: null,
      providerCoverage: { jovie: 1, musicfetch: 1, overlap: 0 },
    });
    expect(comparison.urlDisagreements).toHaveLength(1);
  });

  it('reports match and identifier agreement when both resolvers agree', () => {
    const entity = { id: 'r1', title: 'T', artist: 'A', upc: '123', isrc: 'X' };
    const comparison = compareResolverResults(
      { ...resolved({ spotify: 's' }), entity },
      { ...resolved({ spotify: 's' }), entity: { ...entity, id: 'other' } }
    );
    expect(comparison.status).toBe('match');
    expect(comparison.adjudication).toBe('not_required');
    expect(comparison.identifierAccuracy.agreement).toEqual({
      upc: true,
      isrc: true,
    });
    expect(comparison.metadataCompleteness.jovie).toBe(1);
  });

  it('reports null agreement when identifiers exist on only one side', () => {
    const comparison = compareResolverResults(
      {
        ...resolved({}),
        entity: { id: '', title: 'T', artist: null, upc: '1', isrc: null },
      },
      resolved({})
    );
    expect(comparison.identifierAccuracy.agreement).toEqual({
      upc: null,
      isrc: null,
    });
  });

  it('locks the real founder corpus across every required risk class', () => {
    const coverage = MUSIC_RESOLVER_PARITY_CORPUS.flatMap(seed => seed.covers);
    expect(new Set(coverage).size).toBe(11);
  });
});

describe('runMusicResolverShadow', () => {
  it('serves a cached receipt without resolving or writing', async () => {
    const receipt = { cached: true };
    selectQueue.rows.push([{ receipt }]);

    const result = await runMusicResolverShadow({ input: urlInput });

    expect(result).toBe(receipt);
    expect(mockSelectDistinct).not.toHaveBeenCalled();
    expect(mockInsert).not.toHaveBeenCalled();
  });

  it('records no_match when no exact entity exists', async () => {
    selectQueue.rows.push([]); // cache miss
    selectDistinctQueue.rows.push([]);

    const receipt = await runShadow(urlInput);

    expect(receipt.failureBehavior).toEqual({
      jovie: 'no_match',
      musicfetch: 'no_match',
    });
    expect(receipt.results.jovie.negativeEvidence).toMatchObject({
      reason: 'no_exact_entity',
      candidateCount: 0,
    });
    expect(mockInsert).toHaveBeenCalledOnce();
  });

  it('records ambiguous when multiple exact entities match', async () => {
    selectQueue.rows.push([]);
    selectDistinctQueue.rows.push([{ id: 'a' }, { id: 'b' }]);

    const receipt = await runShadow(urlInput);

    expect(receipt.results.jovie.status).toBe('ambiguous');
    expect(receipt.results.jovie.negativeEvidence).toMatchObject({
      reason: 'multiple_exact_entities',
      candidateCount: 2,
    });
  });

  it('records no_match when the entity disappeared between queries', async () => {
    selectQueue.rows.push([]);
    selectDistinctQueue.rows.push([{ id: 'r1' }]);
    mockGetReleaseById.mockResolvedValue(null);

    const receipt = await runShadow(urlInput);

    expect(receipt.results.jovie.negativeEvidence?.reason).toBe(
      'entity_missing'
    );
  });

  it('resolves provider overrides and fills gaps with ISRC lookups', async () => {
    selectQueue.rows.push(
      [], // cache miss
      [{ isrc: 'USAAA2600001' }] // recording
    );
    selectDistinctQueue.rows.push([{ id: 'r1' }]);
    mockGetReleaseById.mockResolvedValue({
      id: 'r1',
      title: 'Take Me Over',
      artistNames: ['Tim White'],
      upc: '00123456789012',
      providerLinks: [
        {
          providerId: 'spotify',
          url: 'https://open.spotify.com/track/jovie',
          sourceType: 'ingested',
        },
        {
          providerId: 'apple_music',
          url: 'https://music.apple.com/track/jovie',
          sourceType: 'manual',
        },
        { providerId: 'ghost', url: 'https://x.com/1', sourceType: 'ingested' },
        { providerId: 'deezer', url: 'http://bad-url', sourceType: 'ingested' },
      ],
    });
    mockLookupDeezerByIsrc.mockResolvedValue({
      url: 'https://deezer.com/track/1',
      albumUrl: 'https://deezer.com/album/1',
    });
    mockResolveAgentRelease.mockResolvedValue({
      status: 'resolved',
      facts: [
        {
          title: 'Take Me Over',
          artist_name: 'Tim White',
          upc: '00123456789012',
          dsp_links: { spotify: 'https://open.spotify.com/track/mf' },
        },
      ],
    });

    const receipt = await runShadow(urlInput);

    expect(receipt.results.jovie.status).toBe('resolved');
    expect(receipt.results.jovie.entity).toMatchObject({
      id: 'r1',
      title: 'Take Me Over',
      artist: 'Tim White',
      upc: '00123456789012',
      isrc: 'USAAA2600001',
    });
    expect(receipt.results.jovie.providers).toMatchObject({
      spotify: 'https://open.spotify.com/track/jovie',
      apple_music: 'https://music.apple.com/track/jovie',
      deezer: 'https://deezer.com/album/1',
    });
    expect(receipt.results.jovie.provenance).toMatchObject({
      spotify: 'provider_links:ingested',
      deezer: 'deezer_isrc',
    });
    // apple_music already covered by provider links; only deezer fetched.
    expect(mockLookupAppleMusicByIsrc).not.toHaveBeenCalled();
    expect(mockLookupDeezerByIsrc).toHaveBeenCalledWith('USAAA2600001');
    expect(receipt.cost.jovie).toBe(1);
    expect(receipt.results.musicfetch.entity).toMatchObject({
      title: 'Take Me Over',
      artist: 'Tim White',
      upc: '00123456789012',
    });
    expect(receipt.comparison.urlDisagreements).toContainEqual({
      provider: 'spotify',
      jovie: 'https://open.spotify.com/track/jovie',
      musicfetch: 'https://open.spotify.com/track/mf',
    });
    expect(receipt.comparison.status).toBe('disagreement');
  });

  it('fetches both Apple and Deezer when provider links are missing', async () => {
    selectQueue.rows.push([], [{ isrc: 'USAAA2600001' }]);
    selectDistinctQueue.rows.push([{ id: 'r1' }]);
    mockGetReleaseById.mockResolvedValue({
      id: 'r1',
      title: 'T',
      artistNames: [],
      upc: null,
      providerLinks: [],
    });
    mockLookupAppleMusicByIsrc.mockResolvedValue({
      url: 'https://music.apple.com/track/x',
    });
    mockLookupDeezerByIsrc.mockResolvedValue({
      url: 'https://deezer.com/track/1',
      albumUrl: null,
    });

    const receipt = await runShadow({
      kind: 'isrc',
      isrc: 'usaaa2600001',
      territory: 'US',
    });

    expect(mockLookupAppleMusicByIsrc).toHaveBeenCalledWith('USAAA2600001', {
      storefront: 'us',
    });
    expect(receipt.results.jovie.providers).toMatchObject({
      apple_music: 'https://music.apple.com/track/x',
      deezer: 'https://deezer.com/track/1',
    });
    expect(receipt.cost.jovie).toBe(2);
    expect(receipt.results.jovie.entity?.artist).toBeNull();
    // musicfetch resolves by ISRC and returns null -> no_match
    expect(mockMusicfetchLookupByIsrc).toHaveBeenCalledWith('USAAA2600001');
    expect(receipt.results.musicfetch.status).toBe('no_match');
    expect(receipt.results.musicfetch.negativeEvidence?.reason).toBe(
      'musicfetch_no_match'
    );
  });

  it('resolves musicfetch by ISRC for metadata inputs when jovie found one', async () => {
    selectQueue.rows.push([], [{ isrc: 'USAAA2600001' }]);
    selectDistinctQueue.rows.push([{ id: 'r1' }]);
    mockGetReleaseById.mockResolvedValue({
      id: 'r1',
      title: 'Take Me Over',
      artistNames: ['Tim White'],
      upc: null,
      providerLinks: [],
    });
    mockMusicfetchLookupByIsrc.mockResolvedValue({
      links: { spotify: 'https://open.spotify.com/track/mf' },
      raw: {
        name: 'Take Me Over',
        artists: [{ name: 'Tim White' }],
        isrc: 'USAAA2600001',
      },
    });

    const receipt = await runShadow({
      kind: 'metadata',
      artist: 'Tim White',
      title: 'Take Me Over',
      territory: 'US',
    });

    expect(receipt.results.musicfetch.status).toBe('resolved');
    expect(receipt.results.musicfetch.entity).toMatchObject({
      title: 'Take Me Over',
      artist: 'Tim White',
      isrc: 'USAAA2600001',
    });
    expect(receipt.results.musicfetch.provenance).toEqual({
      spotify: 'musicfetch',
    });
  });

  it('skips musicfetch when no exact identifier exists', async () => {
    selectQueue.rows.push([]);
    selectDistinctQueue.rows.push([]);

    const receipt = await runShadow({
      kind: 'metadata',
      artist: 'Tim White',
      title: 'Unknown',
      territory: 'US',
    });

    expect(receipt.results.musicfetch.negativeEvidence?.reason).toBe(
      'no_musicfetch_exact_identifier'
    );
    expect(receipt.results.musicfetch.requestCount).toBe(0);
  });

  it('maps musicfetch error codes to resolver statuses', async () => {
    mockResolveAgentRelease.mockResolvedValue({
      status: 'error',
      code: 'UPSTREAM_FAILURE',
      retryable: true,
    });
    selectQueue.rows.push([]);
    selectDistinctQueue.rows.push([]);

    const receipt = await runShadow(urlInput);
    expect(receipt.results.musicfetch.status).toBe('upstream_error');
    expect(receipt.results.musicfetch.requestCount).toBe(1);

    mockResolveAgentRelease.mockResolvedValue({
      status: 'error',
      code: 'UNSUPPORTED_RELEASE',
      retryable: false,
    });
    selectQueue.rows.push([]);
    selectDistinctQueue.rows.push([]);
    const unsupported = await runShadow({
      kind: 'upc',
      upc: '00123456789012',
      territory: 'US',
    });
    expect(unsupported.results.musicfetch.status).toBe('no_match');
    expect(unsupported.results.musicfetch.requestCount).toBe(0);
  });

  it('records upstream_error when a provider call throws', async () => {
    selectQueue.rows.push([]);
    selectDistinctQueue.rows.push([]);
    mockResolveAgentRelease.mockRejectedValue(new Error('boom'));

    const receipt = await runShadow(urlInput);

    expect(receipt.results.musicfetch.status).toBe('upstream_error');
    expect(receipt.results.musicfetch.negativeEvidence?.reason).toBe(
      'musicfetch_upstream_error'
    );
  });

  it('runs every corpus seed through the shadow path', async () => {
    const receipts = (await runMusicResolverParityCorpus()) as ShadowReceipt[];
    expect(receipts).toHaveLength(MUSIC_RESOLVER_PARITY_CORPUS.length);
    expect(receipts[0]).toMatchObject({
      version: 1,
      corpusSeedId: MUSIC_RESOLVER_PARITY_CORPUS[0].id,
    });
  });
});
