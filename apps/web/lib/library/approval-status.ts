export type LibraryApprovalStatus =
  | 'draft'
  | 'needs_review'
  | 'approved'
  | 'archived';

export const LIBRARY_APPROVAL_STATUSES = [
  'draft',
  'needs_review',
  'approved',
  'archived',
] as const satisfies readonly LibraryApprovalStatus[];

export const DEFAULT_LIBRARY_APPROVAL_STATUS: LibraryApprovalStatus = 'draft';

export function isLibraryApprovalStatus(
  value: string
): value is LibraryApprovalStatus {
  return (LIBRARY_APPROVAL_STATUSES as readonly string[]).includes(value);
}

export function formatLibraryApprovalStatus(
  status: LibraryApprovalStatus
): string {
  return status
    .split('_')
    .map(part => part.slice(0, 1).toUpperCase() + part.slice(1))
    .join(' ');
}

export function libraryApprovalStatusClasses(
  status: LibraryApprovalStatus
): string {
  // Approval lives on a different axis than release status, so its accent must
  // not collide with the green `released` pill. Use the System B purple accent
  // (defined in design-system.css) instead of `success`/green. See #12317.
  if (status === 'approved') {
    // Distinct from release "Released" (green/success) so the two badges never
    // share a color — System B accent spectrum (issue #12317).
    return 'border-accent-purple/20 bg-accent-purple/10 text-accent-purple';
  }
  if (status === 'needs_review') {
    return 'border-warning/20 bg-warning/10 text-warning';
  }
  if (status === 'archived') {
    return 'border-subtle bg-surface-1 text-tertiary-token';
  }
  return 'border-subtle bg-surface-1 text-secondary-token';
}

export function libraryApprovalStatusDotClasses(
  status: LibraryApprovalStatus
): string {
  if (status === 'approved') return 'bg-accent-purple';
  if (status === 'needs_review') return 'bg-warning';
  if (status === 'archived') return 'bg-tertiary-token';
  return 'bg-secondary-token';
}

export function isLibraryReleaseApprovedForPublic(
  approvalStatus: LibraryApprovalStatus | null | undefined
): boolean {
  return approvalStatus === 'approved';
}
