import { describe, expect, it } from 'vitest';
import {
  ASSET_VISIBILITY_QUERY_SET_VERSION,
  type AssetVisibilityObservation,
  assetVisibilityQueryIntentSegment,
  buildAssetVisibilityQuerySet,
  buildAssetVisibilityReport,
  type CreatorAssetDescriptor,
} from '@/lib/aeo/asset-visibility';

const asset = (
  kind: CreatorAssetDescriptor['kind'] = 'video',
  patch: Partial<CreatorAssetDescriptor> = {}
): CreatorAssetDescriptor => ({
  id: `asset-${kind}`,
  creatorProfileId: 'profile-1',
  kind,
  name: kind === 'video' ? 'Studio Week One' : 'North Star',
  creatorName: 'Sample Creator',
  canonicalUrl: `https://jov.ie/sample/${kind}`,
  publicationState: 'public',
  category: kind === 'video' ? 'music vlogger' : 'independent pop',
  ...patch,
});
const provenance: AssetVisibilityObservation['provenance'] = {
  runId: 'run-current',
  engine: 'chatgpt',
  model: 'gpt-search',
  modelVersion: '2026-08-30',
  promptVersion: 'presence-asset-monitor:v1',
  querySetVersion: ASSET_VISIBILITY_QUERY_SET_VERSION,
  market: 'US',
  locale: 'en',
  observedAt: '2026-08-31T12:00:00.000Z',
};
const competitor: AssetVisibilityObservation['competitors'][number] = {
  name: 'Other Vlogger',
  recommendationPosition: 1,
  context: 'recommended',
  sourceUrl: 'https://youtube.com/@other',
  platform: 'youtube',
};
const source = (
  kind: 'citation' | 'retailer',
  url: string,
  platform: string
) => ({ kind, url, platform, title: null });
const obs = (
  patch: Partial<AssetVisibilityObservation> = {}
): AssetVisibilityObservation => ({
  id: 'observation-1',
  assetId: 'asset-video',
  queryId: 'video:recommendation',
  query: 'Recommend a music vlogger to follow.',
  appeared: true,
  recommendationPosition: 2,
  context: 'recommended',
  evidenceExcerpt: 'Sample Creator is the second recommendation.',
  sources: [source('citation', 'https://jov.ie/sample/video', 'jovie')],
  competitors: [competitor],
  provenance,
  ...patch,
});
const old = (patch: Partial<AssetVisibilityObservation> = {}) =>
  obs({
    id: 'observation-old',
    provenance: {
      ...provenance,
      runId: 'run-old',
      observedAt: '2026-08-24T12:00:00.000Z',
    },
    ...patch,
  });
const absent = (patch: Partial<AssetVisibilityObservation> = {}) =>
  obs({
    appeared: false,
    recommendationPosition: null,
    context: 'absent',
    sources: [],
    competitors: [],
    ...patch,
  });
const ranked = (position: number) => obs({ recommendationPosition: position });
const oldRanked = (position: number) =>
  old({ recommendationPosition: position });

describe('asset visibility', () => {
  it('covers every asset kind with stable versioned IDs', () => {
    const expected = {
      artist: ['artist:identity', 'artist:recommendation'],
      music: ['music:specific-work', 'music:recommendation'],
      video: ['video:recommendation', 'video:specific-work'],
      merch: ['merch:availability', 'merch:recommendation'],
      ticket: ['ticket:availability', 'ticket:recommendation'],
      creator_product: [
        'creator_product:availability',
        'creator_product:recommendation',
      ],
    } as const;
    for (const [kind, ids] of Object.entries(expected)) {
      const result = buildAssetVisibilityQuerySet(
        asset(kind as CreatorAssetDescriptor['kind'])
      );
      expect(result.version).toBe(ASSET_VISIBILITY_QUERY_SET_VERSION);
      expect(result.queries.map(query => query.id)).toEqual(ids);
    }
    const video = buildAssetVisibilityQuerySet(asset()).queries;
    expect(video[0]?.text).toMatch(/recommend a music vlogger/i);
    expect(video[1]?.text).toContain('Studio Week One');
    expect(assetVisibilityQueryIntentSegment('new_specific_work')).toBe(
      'new-specific-work'
    );
  });

  it('fails closed without exact creator-scoped private consent', () => {
    const privateAsset = asset('music', {
      publicationState: 'private',
      category: null,
    });
    const consent = (creatorProfileId: string) => ({
      privateMonitoringConsent: {
        creatorProfileId,
        purpose: 'creator_private_monitoring' as const,
      },
    });
    expect(buildAssetVisibilityQuerySet(privateAsset)).toMatchObject({
      eligible: false,
      reason: 'explicit_creator_consent_required',
      queries: [],
    });
    expect(
      buildAssetVisibilityQuerySet(privateAsset, consent('wrong')).eligible
    ).toBe(false);
    expect(
      buildAssetVisibilityQuerySet(privateAsset, consent('profile-1'))
    ).toMatchObject({
      eligible: true,
      consentScope: 'creator_private_monitoring',
    });
  });
  it('retains evidence and aggregates normalized sources and competitors', () => {
    const first = obs();
    const second = obs({
      id: 'observation-2',
      queryId: 'video:specific-work',
      recommendationPosition: 1,
      context: 'citation_only',
      sources: [
        source('citation', 'HTTPS://JOV.IE/sample/video/', 'JOVIE'),
        source('retailer', 'https://sample.shop/item', 'shop'),
      ],
      competitors: [
        {
          ...competitor,
          recommendationPosition: 3,
          sourceUrl: null,
          platform: null,
        },
        {
          name: 'Unranked Creator',
          recommendationPosition: null,
          context: 'mentioned',
          sourceUrl: null,
          platform: null,
        },
      ],
    });
    const report = buildAssetVisibilityReport({
      asset: asset(),
      current: [first, second],
    });
    expect(report.visibility).toMatchObject({
      observedQueries: 2,
      appearanceRate: 1,
      bestPosition: 1,
      averagePosition: 1.5,
      contexts: { recommended: 1, citation_only: 1 },
    });
    expect(report.sources.map(source => source.kind)).toEqual([
      'citation',
      'retailer',
    ]);
    expect(report.observations[0]).toBe(first);
    expect(report.competitors[0]).toMatchObject({
      name: 'Other Vlogger',
      appearanceCount: 2,
      aheadCount: 1,
      averagePosition: 2,
      platforms: ['youtube'],
      sourceUrls: ['https://youtube.com/@other'],
      sourceObservationIds: ['observation-1', 'observation-2'],
      aheadObservationIds: ['observation-1'],
    });
    expect(report.competitors[1]).toMatchObject({ averagePosition: null });
    expect(
      report.actions.find(action => action.code === 'close_competitor_gap')
        ?.sourceObservationIds
    ).toEqual(['observation-1']);
  });

  it('returns source-linked, prepare-only actions in priority order', () => {
    const baseline = buildAssetVisibilityReport({
      asset: asset('music'),
      current: [],
    });
    expect(baseline.actions[0]).toMatchObject({
      code: 'collect_baseline',
      sourceObservationIds: [],
    });
    const missing = absent({ competitors: [competitor] });
    const report = buildAssetVisibilityReport({
      asset: asset(),
      current: [missing],
    });
    expect(report.actions.map(action => action.code)).toEqual([
      'improve_asset_discoverability',
      'close_competitor_gap',
    ]);
    expect(
      report.actions.every(
        action =>
          action.approvalBoundary === 'prepare_only' &&
          action.sourceObservationIds[0] === missing.id
      )
    ).toBe(true);
  });

  it.each([
    [
      'up',
      obs(),
      old({ appeared: false, recommendationPosition: null, context: 'absent' }),
      1,
    ],
    ['down', absent(), old(), -1],
    ['up', ranked(2), oldRanked(5), 0],
    ['down', ranked(5), oldRanked(2), 0],
    ['steady', ranked(5), oldRanked(5), 0],
  ] as const)('classifies a comparable %s trend', (status, current, previous, rate) => {
    const report = buildAssetVisibilityReport({
      asset: asset(),
      current: [current],
      previous: [previous],
    });
    expect(report.trend).toMatchObject({
      comparable: true,
      status,
      appearanceRateDelta: rate,
    });
    if (status === 'down')
      expect(
        report.actions.some(
          action => action.code === 'investigate_visibility_decline'
        )
      ).toBe(true);
  });

  it('uses rank movement inside the appearance-rate noise band', () => {
    const observations = Array.from({ length: 20 }, (_, index) => ({
      id: `observation-${index}`,
      queryId: `video:query-${index}`,
      query: `Asset visibility query ${index}`,
    }));
    const current = observations.map((item, index) =>
      obs({
        ...item,
        appeared: index < 11,
        recommendationPosition: index < 11 ? 5 : null,
        context: index < 11 ? 'recommended' : 'absent',
      })
    );
    const previous = observations.map((item, index) =>
      old({
        ...item,
        id: `observation-old-${index}`,
        appeared: index < 10,
        recommendationPosition: index < 10 ? 2 : null,
        context: index < 10 ? 'recommended' : 'absent',
      })
    );

    const report = buildAssetVisibilityReport({
      asset: asset(),
      current,
      previous,
    });

    expect(report.trend).toMatchObject({
      comparable: true,
      status: 'down',
      appearanceRateDelta: 0.05,
      averagePositionChange: -3,
    });
    expect(
      report.actions.some(
        action => action.code === 'investigate_visibility_decline'
      )
    ).toBe(true);
  });

  it('does not let appearance gains hide complete rank loss', () => {
    const query = (index: number) => ({
      queryId: `video:query-${index}`,
      query: `Recommend creator ${index}.`,
    });
    const current = Array.from({ length: 20 }, (_, index) =>
      index < 12
        ? obs({
            id: `current-${index}`,
            ...query(index),
            recommendationPosition: null,
            context: 'mentioned',
          })
        : absent({
            id: `current-${index}`,
            ...query(index),
          })
    );
    const previous = Array.from({ length: 20 }, (_, index) =>
      index < 10
        ? old({
            id: `previous-${index}`,
            ...query(index),
            recommendationPosition: 10,
          })
        : old({
            id: `previous-${index}`,
            ...query(index),
            appeared: false,
            recommendationPosition: null,
            context: 'absent',
            sources: [],
            competitors: [],
          })
    );

    const report = buildAssetVisibilityReport({
      asset: asset(),
      current,
      previous,
    });

    expect(report.trend).toMatchObject({
      comparable: true,
      status: 'down',
      appearanceRateDelta: 0.1,
      averagePositionChange: -10,
    });
    expect(
      report.actions.some(
        action => action.code === 'investigate_visibility_decline'
      )
    ).toBe(true);
  });

  it('treats ranked and unranked transitions as visibility movement', () => {
    const rankedToUnranked = buildAssetVisibilityReport({
      asset: asset(),
      current: [
        obs({
          recommendationPosition: null,
          context: 'mentioned',
        }),
      ],
      previous: [oldRanked(2)],
    });
    expect(rankedToUnranked.trend).toMatchObject({
      comparable: true,
      status: 'down',
      appearanceRateDelta: 0,
      averagePositionChange: -1,
    });
    expect(
      rankedToUnranked.actions.some(
        action => action.code === 'investigate_visibility_decline'
      )
    ).toBe(true);

    const unrankedToRanked = buildAssetVisibilityReport({
      asset: asset(),
      current: [ranked(2)],
      previous: [
        old({
          recommendationPosition: null,
          context: 'mentioned',
        }),
      ],
    });
    expect(unrankedToRanked.trend).toMatchObject({
      comparable: true,
      status: 'up',
      appearanceRateDelta: 0,
      averagePositionChange: 1,
    });
  });

  it('tracks ranked coverage before comparing average rank', () => {
    const current = [
      obs({
        id: 'current-ranked',
        queryId: 'video:ranked',
        query: 'Recommend a creator to follow.',
        recommendationPosition: 1,
      }),
      obs({
        id: 'current-unranked',
        queryId: 'video:unranked',
        query: 'Recommend a second creator to follow.',
        recommendationPosition: null,
        context: 'mentioned',
      }),
    ];
    const previous = [
      old({
        id: 'previous-ranked',
        queryId: 'video:ranked',
        query: 'Recommend a creator to follow.',
        recommendationPosition: 1,
      }),
      old({
        id: 'previous-unranked',
        queryId: 'video:unranked',
        query: 'Recommend a second creator to follow.',
        recommendationPosition: 100,
      }),
    ];

    const report = buildAssetVisibilityReport({
      asset: asset(),
      current,
      previous,
    });

    expect(report.trend).toMatchObject({
      comparable: true,
      status: 'down',
      appearanceRateDelta: 0,
      averagePositionChange: -1,
    });
    expect(
      report.actions.some(
        action => action.code === 'investigate_visibility_decline'
      )
    ).toBe(true);
  });

  it('does not treat newly gained rankings as visibility declines', () => {
    const current = [
      obs({
        id: 'current-kept',
        queryId: 'video:kept',
        query: 'Recommend a creator to follow.',
        recommendationPosition: 1,
        competitors: [],
      }),
      obs({
        id: 'current-gained',
        queryId: 'video:gained',
        query: 'Recommend another creator to follow.',
        recommendationPosition: 100,
        competitors: [],
      }),
    ];
    const previous = [
      old({
        id: 'previous-kept',
        queryId: 'video:kept',
        query: 'Recommend a creator to follow.',
        recommendationPosition: 1,
        competitors: [],
      }),
      old({
        id: 'previous-gained',
        queryId: 'video:gained',
        query: 'Recommend another creator to follow.',
        recommendationPosition: null,
        context: 'mentioned',
        competitors: [],
      }),
    ];

    const report = buildAssetVisibilityReport({
      asset: asset(),
      current,
      previous,
    });

    expect(report.trend).toMatchObject({
      comparable: true,
      status: 'up',
      appearanceRateDelta: 0,
      averagePositionChange: 1,
    });
    expect(
      report.actions.some(
        action => action.code === 'investigate_visibility_decline'
      )
    ).toBe(false);
  });

  it('matches ranked coverage by comparable observation identity', () => {
    const current = [
      obs({
        id: 'current-chatgpt',
        queryId: 'video:same-query',
        query: 'Recommend a creator to follow.',
        recommendationPosition: 2,
      }),
      obs({
        id: 'current-gemini',
        queryId: 'video:same-query',
        query: 'Recommend a creator to follow.',
        recommendationPosition: null,
        context: 'mentioned',
        provenance: {
          ...provenance,
          engine: 'gemini',
          model: 'gemini-search',
        },
      }),
    ];
    const previous = [
      old({
        id: 'previous-chatgpt',
        queryId: 'video:same-query',
        query: 'Recommend a creator to follow.',
        recommendationPosition: 2,
      }),
      old({
        id: 'previous-gemini',
        queryId: 'video:same-query',
        query: 'Recommend a creator to follow.',
        recommendationPosition: null,
        context: 'mentioned',
        provenance: {
          ...provenance,
          runId: 'run-old',
          engine: 'gemini',
          model: 'gemini-search',
          observedAt: '2026-08-24T12:00:00.000Z',
        },
      }),
    ];

    expect(
      buildAssetVisibilityReport({ asset: asset(), current, previous }).trend
    ).toMatchObject({
      comparable: true,
      status: 'steady',
      averagePositionChange: 0,
    });
  });

  it('rejects duplicate comparable observation identities', () => {
    expect(() =>
      buildAssetVisibilityReport({
        asset: asset(),
        current: [obs(), obs({ id: 'current-duplicate' })],
      })
    ).toThrow('asset_visibility_observation_duplicate_identity');
    expect(() =>
      buildAssetVisibilityReport({
        asset: asset(),
        current: [obs()],
        previous: [old(), old({ id: 'previous-duplicate' })],
      })
    ).toThrow('asset_visibility_observation_duplicate_identity');
  });

  it('includes prior-run evidence in decline actions', () => {
    const report = buildAssetVisibilityReport({
      asset: asset(),
      current: [ranked(5)],
      previous: [oldRanked(2)],
    });

    expect(
      report.actions.find(
        action => action.code === 'investigate_visibility_decline'
      )?.sourceObservationIds
    ).toEqual(['observation-1', 'observation-old']);
  });

  it('rejects duplicate observation IDs across snapshots', () => {
    expect(() =>
      buildAssetVisibilityReport({
        asset: asset(),
        current: [obs({ id: 'reused-observation' })],
        previous: [old({ id: 'reused-observation' })],
      })
    ).toThrow('asset_visibility_observation_duplicate_id');
  });

  it('rejects blank observation evidence IDs', () => {
    expect(() =>
      buildAssetVisibilityReport({
        asset: asset(),
        current: [obs({ id: '' })],
      })
    ).toThrow('asset_visibility_observation_invalid_id');
    expect(() =>
      buildAssetVisibilityReport({
        asset: asset(),
        current: [obs({ id: ' observation-1 ' })],
      })
    ).toThrow('asset_visibility_observation_invalid_id');
  });

  it.each([
    ['no_previous_observations', []],
    ['query_set_mismatch', [old({ queryId: 'video:specific-work' })]],
    [
      'provenance_mismatch',
      [old({ provenance: { ...old().provenance, modelVersion: 'older' } })],
    ],
  ] as const)('marks %s as incomparable', (reason, previous) => {
    expect(
      buildAssetVisibilityReport({ asset: asset(), current: [obs()], previous })
        .trend
    ).toMatchObject({ comparable: false, reason });
  });

  it('adds canonical-citation evidence and rejects cross-asset observations', () => {
    const report = buildAssetVisibilityReport({
      asset: asset(),
      current: [obs({ sources: [], competitors: [] })],
    });
    expect(report.actions[0]?.code).toBe('add_canonical_citation');
    expect(() =>
      buildAssetVisibilityReport({
        asset: asset(),
        current: [obs({ assetId: 'another-asset' })],
      })
    ).toThrow('asset_visibility_observation_asset_mismatch');
    expect(
      buildAssetVisibilityReport({
        asset: asset('video', { canonicalUrl: null }),
        current: [obs({ sources: [] })],
      }).actions.some(action => action.code === 'add_canonical_citation')
    ).toBe(false);
    expect(() =>
      buildAssetVisibilityReport({
        asset: asset(),
        current: [
          obs(),
          obs({
            id: 'retry-observation',
            provenance: { ...provenance, runId: 'run-retry' },
          }),
        ],
      })
    ).toThrow('asset_visibility_observation_run_mismatch');
    expect(() =>
      buildAssetVisibilityReport({
        asset: asset(),
        current: [obs()],
        previous: [
          old({
            provenance: {
              ...provenance,
              runId: 'run-current',
              observedAt: '2026-08-24T12:00:00.000Z',
            },
          }),
        ],
      })
    ).toThrow('asset_visibility_observation_comparison_run_mismatch');
    expect(() =>
      buildAssetVisibilityReport({
        asset: asset(),
        current: [obs({ provenance: { ...provenance, runId: '' } })],
        previous: [
          old({
            provenance: {
              ...provenance,
              runId: ' ',
              observedAt: '2026-08-24T12:00:00.000Z',
            },
          }),
        ],
      })
    ).toThrow('asset_visibility_observation_run_mismatch');
  });

  it('rejects contradictory visibility observation fields', () => {
    expect(() =>
      buildAssetVisibilityReport({
        asset: asset(),
        current: [absent({ recommendationPosition: 1 })],
      })
    ).toThrow('asset_visibility_observation_field_mismatch');
    expect(() =>
      buildAssetVisibilityReport({
        asset: asset(),
        current: [obs({ context: 'absent', recommendationPosition: null })],
      })
    ).toThrow('asset_visibility_observation_field_mismatch');
    expect(() =>
      buildAssetVisibilityReport({
        asset: asset(),
        current: [obs({ recommendationPosition: 0 })],
      })
    ).toThrow('asset_visibility_observation_invalid_position');
    expect(() =>
      buildAssetVisibilityReport({
        asset: asset(),
        current: [
          obs({
            competitors: [
              {
                ...competitor,
                recommendationPosition: 0,
              },
            ],
          }),
        ],
      })
    ).toThrow('asset_visibility_competitor_invalid_position');
  });
});
