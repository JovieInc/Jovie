import type { StatusGlyphState } from '@jovie/ui';

/**
 * Canonical release-status vocabulary and its mapping onto the shared
 * StatusGlyph atom (Pen jAcP1, D5). Replaces the shell `StatusBadge` fork —
 * the glyph + label + tooltip now come from `@jovie/ui`.
 */
export type ReleaseStatus =
  | 'live'
  | 'scheduled'
  | 'draft'
  | 'announced'
  | 'hidden';

export const RELEASE_STATUS_LABEL: Record<ReleaseStatus, string> = {
  live: 'Live',
  scheduled: 'Scheduled',
  announced: 'Announced',
  draft: 'Draft',
  hidden: 'Hidden',
};

export const RELEASE_STATUS_GLYPH_STATE: Record<
  ReleaseStatus,
  StatusGlyphState
> = {
  live: 'done',
  scheduled: 'in_progress',
  announced: 'in_review',
  draft: 'todo',
  hidden: 'canceled',
};
