export interface LibraryRelationshipView {
  readonly id: string;
  readonly kind:
    | 'release_context'
    | 'collaborator_credit'
    | 'features_merch'
    | 'mentions_brand'
    | 'uses_tracked_link'
    | 'promotes_offer'
    | 'youtube_product_placement';
  readonly subjectType: string;
  readonly subjectId: string;
  readonly objectType: string;
  readonly objectId: string;
  readonly status: 'suggested' | 'active' | 'rejected' | 'removed';
  readonly createdAt: string;
}
