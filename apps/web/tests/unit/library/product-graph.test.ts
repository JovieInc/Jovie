import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LIBRARY_PRODUCT_GRAPH_OPTIMIZATION_CONTRACT } from '@/lib/library/product-graph-optimization';

const { mockSelect } = vi.hoisted(() => ({
  mockSelect: vi.fn(),
}));

vi.mock('@/lib/db', () => ({
  db: {
    select: mockSelect,
  },
}));

function thenableQuery(result: unknown) {
  const query = {
    from: vi.fn(),
    where: vi.fn(),
    orderBy: vi.fn(),
    then: (resolve: (value: unknown) => unknown) =>
      Promise.resolve(result).then(resolve),
  };
  query.from.mockReturnValue(query);
  query.where.mockReturnValue(query);
  query.orderBy.mockReturnValue(query);
  return query;
}

function chain(result: unknown) {
  const query = thenableQuery(result);
  mockSelect.mockReturnValue(query);
  return query;
}

function chainResults(...results: unknown[]) {
  let index = 0;
  mockSelect.mockImplementation(() => thenableQuery(results[index++] ?? []));
}

describe('library product graph stores', () => {
  beforeEach(() => {
    vi.resetModules();
    mockSelect.mockReset();
  });

  it('lists active relationships for a profile', async () => {
    chain([
      {
        id: 'rel-1',
        kind: 'features_merch',
        subjectType: 'youtube_video',
        subjectId: 'yt-1',
        objectType: 'merch_product',
        objectId: 'merch-1',
        status: 'active',
        createdAt: new Date('2026-09-01T00:00:00.000Z'),
      },
    ]);
    const { listLibraryRelationshipsForProfile } = await import(
      '@/lib/library/graph-store'
    );
    await expect(
      listLibraryRelationshipsForProfile('profile-1')
    ).resolves.toEqual([
      {
        id: 'rel-1',
        kind: 'features_merch',
        subjectType: 'youtube_video',
        subjectId: 'yt-1',
        objectType: 'merch_product',
        objectId: 'merch-1',
        status: 'active',
        createdAt: '2026-09-01T00:00:00.000Z',
      },
    ]);
  });

  it('lists attested post-release downloads with presence stats', async () => {
    chainResults(
      [
        {
          id: 'dl-1',
          releaseId: 'rel-1',
          title: 'WAV',
          fileName: 'neon.wav',
        },
      ],
      [],
      [],
      [{ provider: 'youtube', status: 'connected' }]
    );
    const { listLibraryPostReleaseBundle } = await import(
      '@/lib/library/post-release-store'
    );
    await expect(listLibraryPostReleaseBundle('profile-1')).resolves.toEqual({
      downloads: [
        {
          id: 'dl-1',
          releaseId: 'rel-1',
          title: 'WAV',
          fileName: 'neon.wav',
        },
      ],
      findings: [],
      rightsholders: [],
      stats: [{ platform: 'youtube', connected: true, measurements: [] }],
    });
  });

  it('lists stored artist rules for a profile', async () => {
    chain([
      {
        id: 'rule-1',
        category: 'brand',
        ruleKey: 'no-face-crop',
        instruction: 'Never crop a face.',
        strength: 'hard_constraint',
        scope: 'artist',
        scopeValue: null,
        allowOverride: false,
        status: 'active',
        provenance: { source: 'manual' },
        confirmedAt: new Date('2026-09-01T00:00:00.000Z'),
        createdAt: new Date('2026-09-01T00:00:00.000Z'),
      },
    ]);
    const { listArtistRulesForProfile } = await import(
      '@/lib/artist-rules/store'
    );
    await expect(listArtistRulesForProfile('profile-1')).resolves.toEqual([
      {
        id: 'rule-1',
        category: 'brand',
        ruleKey: 'no-face-crop',
        instruction: 'Never crop a face.',
        strength: 'hard_constraint',
        scope: 'artist',
        scopeValue: null,
        allowOverride: false,
        status: 'active',
        provenanceSource: 'manual',
        confirmedAt: '2026-09-01T00:00:00.000Z',
        createdAt: '2026-09-01T00:00:00.000Z',
      },
    ]);
  });

  it('does not cap the authenticated Library YouTube projection', () => {
    const source = readFileSync(
      join(process.cwd(), 'lib/youtube-library/queries.ts'),
      'utf8'
    );
    const start = source.indexOf(
      'export async function listVideosForLibraryProjection'
    );
    const nextExport = source.indexOf('\nexport ', start + 1);
    const fn = source.slice(start, nextExport === -1 ? undefined : nextExport);
    expect(fn).toContain('listVideosForLibraryProjection');
    expect(fn).not.toContain('MAX_LIST_LIMIT');
    expect(fn).not.toContain('.limit(');
  });

  it('keeps a complete product optimization contract on existing surfaces', () => {
    expect(LIBRARY_PRODUCT_GRAPH_OPTIMIZATION_CONTRACT).toMatchObject({
      variantIdentity: 'library.product-graph.catalog.v1',
      exposure: expect.stringContaining('Library catalog'),
      outcome: expect.stringContaining('release-to-revenue GMV'),
      attribution: expect.stringContaining('audience-event'),
      contextDimensions: expect.arrayContaining([
        'platform',
        'content-variant',
        'consented-audience-segment',
      ]),
      hypothesis: expect.stringContaining('one-card catalog'),
      primaryMetric: expect.stringContaining('release-to-revenue'),
      guardrails: expect.arrayContaining(['complaint rate']),
      privacy: expect.stringContaining('server-side'),
      optimizerOwner: expect.stringContaining('JOV-5726'),
      cadence: expect.stringContaining('daily'),
      decisionWriteback: expect.stringContaining('model-experiment'),
      rollback: expect.stringContaining('paused'),
    });
  });
});
