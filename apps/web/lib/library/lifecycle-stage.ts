/**
 * Library lifecycle stages (JOV-5362).
 *
 * Idea is a stage, never an asset type. Type (release / media / social /
 * document / merch) and release linkage stay independent axes.
 */

export const LIBRARY_LIFECYCLE_STAGES = ['idea', 'in_progress', 'out'] as const;
export type LibraryLifecycleStage = (typeof LIBRARY_LIFECYCLE_STAGES)[number];

export const LIBRARY_CATALOG_TYPES = [
  'release',
  'media',
  'social',
  'document',
  'merch',
] as const;
export type LibraryCatalogType = (typeof LIBRARY_CATALOG_TYPES)[number];

export const LIBRARY_STAGE_LABELS: Record<
  LibraryLifecycleStage | 'all',
  string
> = {
  all: 'All',
  idea: 'Ideas',
  in_progress: 'In Progress',
  out: 'Out',
};

export function isLibraryLifecycleStage(
  value: string | null | undefined
): value is LibraryLifecycleStage {
  return LIBRARY_LIFECYCLE_STAGES.some(stage => stage === value);
}

export function parseLibraryStageParam(
  value: string | null | undefined
): LibraryLifecycleStage | 'all' {
  if (isLibraryLifecycleStage(value)) return value;
  // Legacy Ideas & Scripts destination — documents are ideas, not a type tab.
  if (value === 'documents') return 'idea';
  return 'all';
}

export interface LibraryLifecycleInput {
  readonly itemKind?: string | null;
  readonly catalogType?: LibraryCatalogType | null;
  readonly status?: string | null;
  readonly approvalStatus?: string | null;
  readonly lifecycleStatus?: string | null;
  readonly documentStage?: string | null;
  readonly privacyStatus?: string | null;
}

export function resolveLibraryCatalogType(
  input: LibraryLifecycleInput
): LibraryCatalogType {
  if (input.catalogType) return input.catalogType;
  if (input.itemKind === 'document') return 'document';
  if (input.itemKind === 'merch') return 'merch';
  if (input.itemKind === 'video' || input.itemKind === 'image') return 'media';
  if (input.itemKind === 'audio') return 'media';
  return 'release';
}

/**
 * Map stored item state onto the creator Library stage axis.
 *
 * Approval/review and scheduled work are In Progress. Unpublished drafts and
 * private documents are Ideas. Released, live, capture-ready, and public
 * YouTube objects are Out. Archive is a type/lifecycle filter, not a stage.
 */
export function resolveLibraryLifecycleStage(
  input: LibraryLifecycleInput
): LibraryLifecycleStage {
  if (input.documentStage === 'private_draft') return 'idea';
  if (
    input.documentStage === 'evidence_review' ||
    input.documentStage === 'creator_approved'
  ) {
    return 'in_progress';
  }
  if (input.documentStage === 'capture_ready') return 'out';

  const privacy = input.privacyStatus?.toLowerCase() ?? '';
  if (privacy === 'private') return 'idea';
  if (privacy === 'unlisted') return 'in_progress';
  if (privacy === 'public') return 'out';

  if (input.approvalStatus === 'needs_review') return 'in_progress';

  if (input.status === 'released' || input.status === 'live') return 'out';
  if (
    input.status === 'scheduled' ||
    input.status === 'paused' ||
    input.approvalStatus === 'approved'
  ) {
    return 'in_progress';
  }
  if (input.status === 'draft' || input.approvalStatus === 'draft') {
    return 'idea';
  }

  return 'out';
}

export function libraryAssetMatchesStage(
  input: LibraryLifecycleInput,
  stage: LibraryLifecycleStage | 'all'
): boolean {
  if (stage === 'all') return true;
  return resolveLibraryLifecycleStage(input) === stage;
}
