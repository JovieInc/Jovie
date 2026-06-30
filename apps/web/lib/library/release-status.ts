import type { ReleaseViewModel } from '@/lib/discography/types';

export type LibraryReleaseStatus = ReleaseViewModel['status'];

/**
 * Badge accent classes per release status. Each non-neutral status owns a
 * distinct System B accent so it never collides with another semantic badge.
 * `released` uses accent (purple) so it reads distinctly from approval's
 * `approved` (success/green) — see `libraryApprovalStatusClasses`.
 */
export function releaseStatusClasses(status: LibraryReleaseStatus): string {
  if (status === 'released') {
    return 'border-accent/20 bg-accent/10 text-accent';
  }
  if (status === 'scheduled') {
    return 'border-info/20 bg-info/10 text-info';
  }
  return 'border-subtle bg-surface-1 text-tertiary-token';
}

export function releaseStatusDotClasses(status: LibraryReleaseStatus): string {
  if (status === 'released') return 'bg-accent';
  if (status === 'scheduled') return 'bg-info';
  return 'bg-tertiary-token';
}
