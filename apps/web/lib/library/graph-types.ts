export const LIBRARY_RELATIONSHIP_KINDS = [
  'release_context',
  'collaborator_credit',
  'features_merch',
  'mentions_brand',
  'uses_tracked_link',
  'promotes_offer',
  'youtube_product_placement',
] as const;

export type LibraryRelationshipKind =
  (typeof LIBRARY_RELATIONSHIP_KINDS)[number];

export const LIBRARY_RELATIONSHIP_STATUSES = [
  'suggested',
  'active',
  'rejected',
  'removed',
] as const;

export type LibraryRelationshipStatus =
  (typeof LIBRARY_RELATIONSHIP_STATUSES)[number];

export interface LibraryRelationshipView {
  readonly id: string;
  readonly kind: LibraryRelationshipKind;
  readonly subjectType: string;
  readonly subjectId: string;
  readonly objectType: string;
  readonly objectId: string;
  readonly status: LibraryRelationshipStatus;
  readonly createdAt: string;
}

export interface LibraryMerchProductOption {
  readonly id: string;
  readonly title: string;
}
