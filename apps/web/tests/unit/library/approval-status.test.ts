import { describe, expect, it } from 'vitest';
import {
  formatLibraryApprovalStatus,
  isLibraryApprovalStatus,
  isLibraryReleaseApprovedForPublic,
  libraryApprovalStatusClasses,
  libraryApprovalStatusDotClasses,
} from '@/lib/library/approval-status';

describe('library approval status helpers', () => {
  it('formats approval labels for the library surface', () => {
    expect(formatLibraryApprovalStatus('draft')).toBe('Draft');
    expect(formatLibraryApprovalStatus('needs_review')).toBe('Needs Review');
    expect(formatLibraryApprovalStatus('approved')).toBe('Approved');
  });

  it('validates known approval statuses', () => {
    expect(isLibraryApprovalStatus('approved')).toBe(true);
    expect(isLibraryApprovalStatus('draft')).toBe(true);
    expect(isLibraryApprovalStatus('published')).toBe(false);
  });

  it('maps approval statuses to semantic classes', () => {
    expect(libraryApprovalStatusClasses('needs_review')).toContain(
      'text-warning'
    );
  });

  it('keeps the approved accent distinct from the green released pill (#12317)', () => {
    // Bug: "Approved" and "Released" both rendered green. Approved must use a
    // distinct System B accent (purple), never the success/green tokens.
    const approvedPill = libraryApprovalStatusClasses('approved');
    expect(approvedPill).toBe('system-b-library-status-pill--approved');
    expect(approvedPill).not.toContain('success');

    const approvedDot = libraryApprovalStatusDotClasses('approved');
    expect(approvedDot).toBe('system-b-library-status-dot--approved');
    expect(approvedDot).not.toContain('success');
  });

  it('only treats approved releases as public-profile eligible', () => {
    expect(isLibraryReleaseApprovedForPublic('approved')).toBe(true);
    expect(isLibraryReleaseApprovedForPublic('draft')).toBe(false);
    expect(isLibraryReleaseApprovedForPublic('needs_review')).toBe(false);
    expect(isLibraryReleaseApprovedForPublic('archived')).toBe(false);
    expect(isLibraryReleaseApprovedForPublic(undefined)).toBe(false);
    expect(isLibraryReleaseApprovedForPublic(null)).toBe(false);
  });
});
