import type {
  CreatorOffer,
  LibraryRelationship,
} from '@/lib/db/schema/library-content-graph';

type RelationshipKind = LibraryRelationship['kind'];
type EntityType = LibraryRelationship['subjectType'];

export interface ApprovedYouTubeCollaboratorCredit {
  readonly artistCreatorProfileId: string | null;
  readonly isPrimary: boolean;
}

export function isExternalCollaboratorCredit(
  creatorProfileId: string,
  credit: ApprovedYouTubeCollaboratorCredit
): boolean {
  return (
    !credit.isPrimary && credit.artistCreatorProfileId !== creatorProfileId
  );
}

const ALLOWED_PAIRS: Record<
  RelationshipKind,
  readonly (readonly [EntityType, EntityType])[]
> = {
  release_context: [
    ['youtube_video', 'release'],
    ['social_content', 'release'],
    ['merch_product', 'release'],
    ['creator_document', 'release'],
  ],
  collaborator_credit: [
    ['release', 'artist'],
    ['recording', 'artist'],
    ['youtube_video', 'artist'],
  ],
  features_merch: [
    ['youtube_video', 'merch_product'],
    ['social_content', 'merch_product'],
  ],
  mentions_brand: [
    ['youtube_video', 'brand'],
    ['social_content', 'brand'],
  ],
  uses_tracked_link: [
    ['youtube_video', 'source_link'],
    ['social_content', 'source_link'],
  ],
  promotes_offer: [
    ['youtube_video', 'offer'],
    ['social_content', 'offer'],
  ],
  youtube_product_placement: [['merch_product', 'provider_placement']],
};

export function relationshipTypesAreValid(
  relationship: Pick<LibraryRelationship, 'kind' | 'subjectType' | 'objectType'>
): boolean {
  return ALLOWED_PAIRS[relationship.kind].some(
    ([subject, object]) =>
      subject === relationship.subjectType && object === relationship.objectType
  );
}

export type RelationshipActivationResult =
  | { readonly ok: true }
  | {
      readonly ok: false;
      readonly reason:
        | 'invalid_entity_pair'
        | 'not_suggested'
        | 'review_required'
        | 'missing_evidence';
    };

export function validateRelationshipActivation(
  relationship: LibraryRelationship
): RelationshipActivationResult {
  if (!relationshipTypesAreValid(relationship)) {
    return { ok: false, reason: 'invalid_entity_pair' };
  }
  if (relationship.status !== 'suggested') {
    return { ok: false, reason: 'not_suggested' };
  }
  if (!relationship.evidence.source.trim()) {
    return { ok: false, reason: 'missing_evidence' };
  }
  const authoritative = new Set([
    'youtube_api',
    'catalog_credit',
    'provider_credit',
    'artist_confirmation',
  ]).has(relationship.evidence.source);
  if (
    !authoritative &&
    (!relationship.reviewedBy || !relationship.reviewedAt)
  ) {
    return { ok: false, reason: 'review_required' };
  }
  return { ok: true };
}

export type OfferPublicationResult =
  | { readonly ok: true }
  | {
      readonly ok: false;
      readonly reason:
        | 'offer_not_active'
        | 'offer_not_effective'
        | 'offer_expired'
        | 'missing_disclosure';
    };

export function validateOfferPublication(
  offer: CreatorOffer,
  now = new Date()
): OfferPublicationResult {
  if (offer.status !== 'active') {
    return { ok: false, reason: 'offer_not_active' };
  }
  if (offer.effectiveAt && offer.effectiveAt > now) {
    return { ok: false, reason: 'offer_not_effective' };
  }
  if (offer.expiresAt && offer.expiresAt <= now) {
    return { ok: false, reason: 'offer_expired' };
  }
  if (
    (offer.offerType === 'affiliate' || offer.offerType === 'sponsor') &&
    !offer.disclosureText?.trim()
  ) {
    return { ok: false, reason: 'missing_disclosure' };
  }
  return { ok: true };
}
