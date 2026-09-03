import { describe, expect, it } from 'vitest';
import {
  canPublishOwnedDownload,
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

describe('post-release Library invariants', () => {
  it('never treats Songview or MLC observations as legal title', () => {
    expect(
      validateRightsholderEvidence({
        evidenceClass: 'claimed',
        source: 'songview',
        shareBps: 5000,
      })
    ).toEqual({ ok: false, reason: 'public_registry_must_be_observed' });
    expect(
      validateRightsholderEvidence({
        evidenceClass: 'observed',
        source: 'mlc',
        shareBps: 5000,
      })
    ).toEqual({ ok: true });
    expect(
      validateRightsholderEvidence({
        evidenceClass: 'attested',
        source: 'catalog',
        shareBps: 10_000,
      })
    ).toEqual({ ok: false, reason: 'attestation_source_mismatch' });
    expect(
      validateRightsholderEvidence({
        evidenceClass: 'claimed',
        source: 'other',
        shareBps: 10_001,
      })
    ).toEqual({ ok: false, reason: 'invalid_share' });
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
    ).toEqual({ ok: true, status: 'drafted', collisionDisposition: null });
    expect(move(repair, 'prepare_update')).toEqual({
      ok: true,
      status: 'resolved',
      collisionDisposition: null,
    });
    expect(
      move(
        { ...repair, actionMode: 'draft_request', draftRequest: '   ' },
        'prepare_update'
      )
    ).toEqual({ ok: false, reason: 'draft_missing' });
    expect(move(repair, 'dismiss')).toEqual({
      ok: true,
      status: 'dismissed',
      collisionDisposition: null,
    });
    expect(move(repair, 'confirmed_match')).toEqual({
      ok: false,
      reason: 'not_a_collision',
    });
    expect(move(collision, 'not_this_artist')).toEqual({
      ok: true,
      status: 'dismissed',
      collisionDisposition: 'not_this_artist',
    });
    expect(move(collision, 'not_this_song')).toEqual({
      ok: true,
      status: 'dismissed',
      collisionDisposition: 'not_this_song',
    });
    expect(move(collision, 'confirmed_match')).toEqual({
      ok: true,
      status: 'resolved',
      collisionDisposition: 'confirmed_match',
    });
    expect(
      move(
        {
          ...collision,
          actionMode: 'draft_request',
          draftRequest: 'Please prepare an update',
        },
        'prepare_update'
      )
    ).toEqual({ ok: false, reason: 'wrong_collision_action' });
  });
});

describe('Library post-release optimization contract', () => {
  it('declares JOV-INV-012 on existing telemetry surfaces', () => {
    expect(LIBRARY_POST_RELEASE_OPTIMIZATION.kind).toBe('product');
    expect(LIBRARY_POST_RELEASE_OPTIMIZATION.surfaces.analytics).toBe(
      'apps/web/lib/analytics/metrics.ts'
    );
    expect(LIBRARY_POST_RELEASE_OPTIMIZATION.surfaces.modelExperiment).toBe(
      'apps/web/lib/db/schema/model-experiments.ts'
    );
    expect(LIBRARY_POST_RELEASE_OPTIMIZATION.surfaces.audienceEvent).toBe(
      'apps/web/lib/audience/record-audience-event.ts'
    );
    expect(LIBRARY_POST_RELEASE_OPTIMIZATION.surfaces.youtubeExperiment).toBe(
      'apps/web/lib/youtube-library/thumbnail-experiments.ts'
    );
    expect(LIBRARY_POST_RELEASE_OPTIMIZATION.surfaces.releaseToRevenue).toBe(
      'apps/web/lib/release-to-revenue/gmv-attribution.ts'
    );
    expect(LIBRARY_POST_RELEASE_OPTIMIZATION.surfaces.experimentLedger).toBe(
      'apps/web/lib/db/schema/library-content-graph.ts'
    );
    expect(LIBRARY_POST_RELEASE_OPTIMIZATION.primaryMetric).toContain(
      'attributed GMV'
    );
    expect(LIBRARY_POST_RELEASE_OPTIMIZATION.primaryMetric).not.toMatch(
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
    const allowed = {
      involvesIdentityOrBrand: false,
      involvesLegalOrPrivacy: false,
      involvesExternalPublication: false,
      involvesMaterialSpend: false,
    };
    expect(
      canAutoPromotePostReleaseVariant({
        findingKind: 'placement_opportunity',
        ...allowed,
      })
    ).toBe(true);
    expect(
      canAutoPromotePostReleaseVariant({ findingKind: 'repair', ...allowed })
    ).toBe(false);
    expect(
      canAutoPromotePostReleaseVariant({
        findingKind: 'placement_opportunity',
        ...allowed,
        involvesIdentityOrBrand: true,
      })
    ).toBe(false);
  });
});
