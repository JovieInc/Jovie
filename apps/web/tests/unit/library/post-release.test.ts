import { describe, expect, it } from 'vitest';
import {
  canPublishOwnedDownload,
  transitionPresenceFinding,
  validateRightsholderEvidence,
} from '@/lib/library/post-release';

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
  });

  it('publishes a download only after explicit rights-control attestation', () => {
    expect(
      canPublishOwnedDownload({
        isActive: true,
        rightsControlAttested: false,
      })
    ).toBe(false);
    expect(
      canPublishOwnedDownload({
        isActive: true,
        rightsControlAttested: true,
      })
    ).toBe(true);
  });

  it('prepares a request as a draft without marking the repair resolved', () => {
    expect(
      transitionPresenceFinding(
        {
          kind: 'repair',
          actionMode: 'draft_request',
          draftRequest: 'Please replace the dead link with https://jov.ie/tim',
          status: 'open',
        },
        'prepare_update'
      )
    ).toEqual({
      ok: true,
      status: 'drafted',
      collisionDisposition: null,
    });
  });

  it('makes not-this-artist and not-this-song durable collision outcomes', () => {
    expect(
      transitionPresenceFinding(
        {
          kind: 'collision',
          actionMode: 'filter_only',
          draftRequest: null,
          status: 'open',
        },
        'not_this_artist'
      )
    ).toEqual({
      ok: true,
      status: 'dismissed',
      collisionDisposition: 'not_this_artist',
    });
  });
});
