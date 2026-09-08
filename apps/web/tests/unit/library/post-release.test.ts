import { describe, expect, it } from 'vitest';
import {
  canPublishOwnedDownload,
  presenceActionFailureStatus,
  transitionPresenceFinding,
  validateRightsholderEvidence,
} from '@/lib/library/post-release';
import {
  canAutoPromotePostReleaseVariant,
  LIBRARY_POST_RELEASE_OPTIMIZATION,
  libraryPostReleaseVariantIdentity,
  parseOptimizationVariantKeys,
} from '@/lib/library/post-release-optimization';

const repair = {
  kind: 'repair' as const,
  actionMode: 'direct_update' as const,
  draftRequest: null,
  status: 'open' as const,
};
const collision = {
  kind: 'collision' as const,
  actionMode: 'filter_only' as const,
  draftRequest: null,
  status: 'open' as const,
};
const move = transitionPresenceFinding;
const fail = (reason: string) => ({ ok: false, reason });
const ok = (
  status: 'drafted' | 'resolved' | 'dismissed',
  collisionDisposition:
    | 'not_this_artist'
    | 'not_this_song'
    | 'confirmed_match'
    | null = null
) => ({ ok: true as const, status, collisionDisposition });
const evidence = (
  evidenceClass: 'claimed' | 'observed' | 'attested',
  source: 'songview' | 'mlc' | 'catalog' | 'other',
  shareBps: number
) => validateRightsholderEvidence({ evidenceClass, source, shareBps });
const contract = LIBRARY_POST_RELEASE_OPTIMIZATION;
const allowed = {
  involvesIdentityOrBrand: false,
  involvesLegalOrPrivacy: false,
  involvesExternalPublication: false,
  involvesMaterialSpend: false,
};
const promote = (
  findingKind: 'repair' | 'collision' | 'placement_opportunity',
  extra = {}
) => canAutoPromotePostReleaseVariant({ findingKind, ...allowed, ...extra });

describe('post-release Library invariants', () => {
  it('never treats Songview or MLC observations as legal title', () => {
    expect(evidence('claimed', 'songview', 5000)).toEqual(
      fail('public_registry_must_be_observed')
    );
    expect(evidence('observed', 'mlc', 5000)).toEqual({ ok: true });
    expect(evidence('attested', 'catalog', 10_000)).toEqual(
      fail('attestation_source_mismatch')
    );
    expect(evidence('claimed', 'other', 10_001)).toEqual(fail('invalid_share'));
  });

  it('publishes a download only after explicit rights-control attestation', () => {
    expect(
      canPublishOwnedDownload({ isActive: true, rightsControlAttested: false })
    ).toBe(false);
    expect(
      canPublishOwnedDownload({ isActive: true, rightsControlAttested: true })
    ).toBe(true);
  });

  it('governs repair, collision, and direct-update transitions', () => {
    expect(
      move(
        {
          ...repair,
          actionMode: 'draft_request',
          draftRequest: 'Please replace the dead link with https://jov.ie/tim',
        },
        'prepare_update'
      )
    ).toEqual(ok('drafted'));
    expect(move(repair, 'prepare_update')).toEqual(ok('resolved'));
    expect(
      move(
        { ...repair, actionMode: 'draft_request', draftRequest: '   ' },
        'prepare_update'
      )
    ).toEqual(fail('draft_missing'));
    expect(move(repair, 'dismiss')).toEqual(ok('dismissed'));
    expect(move(repair, 'confirmed_match')).toEqual(fail('not_a_collision'));
    expect(move(collision, 'not_this_artist')).toEqual(
      ok('dismissed', 'not_this_artist')
    );
    expect(move(collision, 'not_this_song')).toEqual(
      ok('dismissed', 'not_this_song')
    );
    expect(move(collision, 'confirmed_match')).toEqual(
      ok('resolved', 'confirmed_match')
    );
    expect(
      move(
        {
          ...collision,
          actionMode: 'draft_request',
          draftRequest: 'Please prepare an update',
        },
        'prepare_update'
      )
    ).toEqual(fail('wrong_collision_action'));
    expect(
      move(
        {
          ...repair,
          actionMode: 'draft_request',
          draftRequest: 'Please replace the dead link',
          status: 'drafted',
        },
        'dismiss'
      )
    ).toEqual(ok('dismissed'));
    for (const status of ['resolved', 'dismissed'] as const) {
      expect(move({ ...repair, status }, 'prepare_update')).toEqual(
        fail('already_terminal')
      );
    }
    expect(
      move({ ...collision, status: 'resolved' }, 'confirmed_match')
    ).toEqual(fail('already_terminal'));
    expect(presenceActionFailureStatus('not_found')).toBe(404);
    expect(presenceActionFailureStatus('already_terminal')).toBe(409);
    expect(presenceActionFailureStatus('wrong_collision_action')).toBe(409);
  });
});

describe('Library post-release optimization contract', () => {
  it('declares JOV-INV-012 on existing telemetry surfaces', () => {
    expect(contract.kind).toBe('product');
    expect(contract.surfaces).toEqual({
      analytics: 'apps/web/lib/analytics/metrics.ts',
      modelExperiment: 'apps/web/lib/db/schema/model-experiments.ts',
      audienceEvent: 'apps/web/lib/audience/record-audience-event.ts',
      youtubeExperiment:
        'apps/web/lib/youtube-library/thumbnail-experiments.ts',
      releaseToRevenue: 'apps/web/lib/release-to-revenue/gmv-attribution.ts',
      experimentLedger: 'apps/web/lib/db/schema/library-content-graph.ts',
    });
    expect(contract.primaryMetric).toContain('attributed GMV');
    expect(contract.primaryMetric).not.toMatch(
      /engagement|ctr|clicks?|impressions?|views?/i
    );
  });

  it('builds stable variant identity and blocks unsafe auto-promotion', () => {
    expect(
      libraryPostReleaseVariantIdentity({
        kind: 'release',
        canonicalId: 'rel_1',
        experimentId: 'exp_1',
        variantKey: 'control',
      })
    ).toBe('library-content-card:release:rel_1:exp_1:control');
    expect(
      parseOptimizationVariantKeys([{ key: 'challenger' }, 'control'])
    ).toEqual(['challenger', 'control']);
    expect(
      parseOptimizationVariantKeys({ challenger: {}, control: {} })
    ).toEqual(['challenger', 'control']);
    expect(parseOptimizationVariantKeys(null)).toEqual([]);
    expect(promote('placement_opportunity')).toBe(true);
    expect(promote('repair')).toBe(false);
    expect(
      promote('placement_opportunity', { involvesIdentityOrBrand: true })
    ).toBe(false);
  });
});
