import { describe, expect, it } from 'vitest';
import type {
  CreatorOffer,
  LibraryRelationship,
} from '@/lib/db/schema/library-content-graph';
import {
  isExternalCollaboratorCredit,
  relationshipTypesAreValid,
  validateOfferPublication,
  validateRelationshipActivation,
} from '@/lib/library/relationships';

function relationship(
  overrides: Partial<LibraryRelationship> = {}
): LibraryRelationship {
  return {
    id: 'relationship-1',
    creatorProfileId: 'profile-1',
    kind: 'features_merch',
    subjectType: 'youtube_video',
    subjectId: 'video-1',
    objectType: 'merch_product',
    objectId: 'merch-1',
    status: 'suggested',
    confidence: '0.7500',
    evidence: { source: 'vision_model', rationale: 'Garment match' },
    reviewedBy: null,
    reviewedAt: null,
    effectiveAt: null,
    expiresAt: null,
    createdAt: new Date('2026-08-28T00:00:00.000Z'),
    updatedAt: new Date('2026-08-28T00:00:00.000Z'),
    ...overrides,
  };
}

function offer(overrides: Partial<CreatorOffer> = {}): CreatorOffer {
  return {
    id: 'offer-1',
    creatorProfileId: 'profile-1',
    brandId: 'brand-1',
    offerType: 'affiliate',
    name: 'Summer campaign',
    destinationUrl: 'https://brand.test/product',
    sourceLinkId: 'link-1',
    disclosureText: '#ad',
    terms: { commissionPercent: 10 },
    status: 'active',
    effectiveAt: new Date('2026-08-01T00:00:00.000Z'),
    expiresAt: new Date('2026-09-01T00:00:00.000Z'),
    createdAt: new Date('2026-08-01T00:00:00.000Z'),
    updatedAt: new Date('2026-08-01T00:00:00.000Z'),
    ...overrides,
  };
}

describe('Library relationships', () => {
  it('only allows typed relationship pairs', () => {
    expect(relationshipTypesAreValid(relationship())).toBe(true);
    expect(
      relationshipTypesAreValid(
        relationship({ objectType: 'artist', objectId: 'artist-1' })
      )
    ).toBe(false);
  });

  it('requires review before a model-detected merch tag becomes active', () => {
    expect(validateRelationshipActivation(relationship())).toEqual({
      ok: false,
      reason: 'review_required',
    });
    expect(
      validateRelationshipActivation(
        relationship({
          reviewedBy: 'user-1',
          reviewedAt: new Date('2026-08-28T01:00:00.000Z'),
        })
      )
    ).toEqual({ ok: true });
  });

  it('accepts authoritative catalog credits without inventing consent', () => {
    expect(
      validateRelationshipActivation(
        relationship({
          kind: 'collaborator_credit',
          subjectType: 'recording',
          objectType: 'artist',
          evidence: { source: 'catalog_credit', sourceId: 'credit-1' },
        })
      )
    ).toEqual({ ok: true });
  });

  it('projects only non-primary catalog artists into the collaborator graph', () => {
    expect(
      isExternalCollaboratorCredit('profile-1', {
        artistCreatorProfileId: null,
        isPrimary: false,
      })
    ).toBe(true);
    expect(
      isExternalCollaboratorCredit('profile-1', {
        artistCreatorProfileId: 'profile-1',
        isPrimary: false,
      })
    ).toBe(false);
    expect(
      isExternalCollaboratorCredit('profile-1', {
        artistCreatorProfileId: 'profile-2',
        isPrimary: true,
      })
    ).toBe(false);
  });

  it('fails commercial publication closed on missing disclosure or expiry', () => {
    expect(
      validateOfferPublication(
        offer({ disclosureText: null }),
        new Date('2026-08-15')
      )
    ).toEqual({ ok: false, reason: 'missing_disclosure' });
    expect(validateOfferPublication(offer(), new Date('2026-09-02'))).toEqual({
      ok: false,
      reason: 'offer_expired',
    });
  });
});
