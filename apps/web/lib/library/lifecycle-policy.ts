/**
 * Canonical Library retention policy (JOV-3374).
 *
 * Removal is destructive only when the caller can prove that an item is a
 * draft/never-published record with no durable external or analytics evidence.
 * Every other case fails closed to archive.
 */
export type LibraryLifecycleItemKind =
  | 'release'
  | 'track'
  | 'merch'
  | 'image'
  | 'video'
  | 'audio';

export type LibraryRemovalMode = 'archive' | 'delete';

export type LibraryArchiveReason =
  | 'ingested'
  | 'isrc'
  | 'published'
  | 'analytics'
  | 'delete_eligibility_unproven';

export interface LibraryRemovalPolicyInput {
  readonly itemKind: LibraryLifecycleItemKind;
  readonly isDraftOrNeverPublished: boolean;
  readonly isIngested?: boolean;
  readonly hasIsrc?: boolean;
  readonly hasBeenPublished?: boolean;
  readonly hasAnalytics?: boolean;
}

export type LibraryRemovalPolicy =
  | {
      readonly mode: 'archive';
      readonly reason: LibraryArchiveReason;
    }
  | {
      readonly mode: 'delete';
      readonly reason: null;
    };

export function resolveLibraryRemovalPolicy(
  input: LibraryRemovalPolicyInput
): LibraryRemovalPolicy {
  if (input.isIngested) {
    return { mode: 'archive', reason: 'ingested' };
  }
  if (input.hasIsrc) {
    return { mode: 'archive', reason: 'isrc' };
  }
  if (input.hasBeenPublished) {
    return { mode: 'archive', reason: 'published' };
  }
  if (input.hasAnalytics) {
    return { mode: 'archive', reason: 'analytics' };
  }
  if (!input.isDraftOrNeverPublished) {
    return { mode: 'archive', reason: 'delete_eligibility_unproven' };
  }

  return { mode: 'delete', reason: null };
}

/**
 * Images, video, and audio are currently projections of a release row in the
 * Library rather than independently persisted assets. They therefore inherit
 * the parent release's lifecycle until stable per-asset identities exist.
 */
export function getLibraryLifecycleOwnerKind(
  itemKind: LibraryLifecycleItemKind
): 'release' | 'track' | 'merch' {
  if (itemKind === 'image' || itemKind === 'video' || itemKind === 'audio') {
    return 'release';
  }
  return itemKind;
}
