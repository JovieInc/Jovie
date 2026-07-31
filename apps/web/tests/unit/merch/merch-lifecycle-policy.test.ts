import { describe, expect, it } from 'vitest';
import {
  isMerchArchived,
  resolveArchivedMerchRestoreStatus,
  resolveMerchRemovalPolicy,
} from '@/lib/merch/merch-lifecycle-policy';

describe('merch lifecycle policy (JOV-3374)', () => {
  it('allows deletion of a pristine draft', () => {
    expect(
      resolveMerchRemovalPolicy({
        status: 'draft',
        publishedAt: null,
        views: 0,
        clicks: 0,
        addToCarts: 0,
        purchases: 0,
        grossRevenueCents: 0,
      })
    ).toEqual({ mode: 'delete', reason: null });
  });

  it('archives previously published merch even when it is paused', () => {
    expect(
      resolveMerchRemovalPolicy({
        status: 'paused',
        publishedAt: '2026-07-01T00:00:00.000Z',
      })
    ).toEqual({ mode: 'archive', reason: 'published' });
  });

  it('archives a draft when it has analytics evidence', () => {
    expect(
      resolveMerchRemovalPolicy({
        status: 'draft',
        views: 1,
      })
    ).toEqual({ mode: 'archive', reason: 'analytics' });
  });

  it('reads the existing merch status/archivedAt state without approval state', () => {
    expect(isMerchArchived({ status: 'archived', archivedAt: null })).toBe(
      true
    );
    expect(
      isMerchArchived({
        status: 'paused',
        archivedAt: '2026-07-01T00:00:00.000Z',
      })
    ).toBe(true);
    expect(isMerchArchived({ status: 'draft', archivedAt: null })).toBe(false);
  });

  it('restores archived merch to a private editable draft', () => {
    expect(resolveArchivedMerchRestoreStatus()).toBe('draft');
  });
});
