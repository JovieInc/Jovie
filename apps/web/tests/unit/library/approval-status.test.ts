import { describe, expect, it } from 'vitest';
import {
  DEFAULT_LIBRARY_APPROVAL_STATUS,
  formatLibraryApprovalStatus,
  isLibraryApprovalStatus,
  libraryApprovalStatusClasses,
} from '@/lib/library/approval-status';

describe('library approval status helpers', () => {
  it('formats approval status labels for the library surface', () => {
    expect(formatLibraryApprovalStatus('draft')).toBe('Draft');
    expect(formatLibraryApprovalStatus('needs_review')).toBe('Needs Review');
    expect(formatLibraryApprovalStatus('approved')).toBe('Approved');
    expect(formatLibraryApprovalStatus('archived')).toBe('Archived');
  });

  it('validates known approval statuses', () => {
    expect(isLibraryApprovalStatus('approved')).toBe(true);
    expect(isLibraryApprovalStatus('released')).toBe(false);
    expect(DEFAULT_LIBRARY_APPROVAL_STATUS).toBe('draft');
  });

  it('maps approval status to semantic token classes', () => {
    expect(libraryApprovalStatusClasses('approved')).toContain('text-success');
    expect(libraryApprovalStatusClasses('needs_review')).toContain(
      'text-warning'
    );
    expect(libraryApprovalStatusClasses('archived')).toContain(
      'text-tertiary-token'
    );
  });
});
