import { describe, expect, it } from 'vitest';
import {
  buildPublicReleaseApprovalSeedRow,
  isMissingPromoDownloadsRelationError,
  isRetryableSeedDatabaseError,
} from '../../seed-test-data';

describe('buildPublicReleaseApprovalSeedRow', () => {
  it('marks seeded releases approved so public-profile fixtures stay visible', () => {
    expect(
      buildPublicReleaseApprovalSeedRow('profile-123', 'release-456')
    ).toEqual({
      creatorProfileId: 'profile-123',
      assetId: 'release-456',
      itemKind: 'release',
      approvalStatus: 'approved',
    });
  });
});

describe('seedTestData database retry classifier', () => {
  it('treats Neon password auth failures as retryable', () => {
    const error = new Error(
      "password authentication failed for user 'neondb_owner'"
    );

    expect(isRetryableSeedDatabaseError(error)).toBe(true);
  });

  it('treats wrapped Neon endpoint bootstrap failures as retryable', () => {
    const error = new Error('Failed query');
    error.cause = new Error(
      "The requested endpoint could not be found, or you don't have access to it."
    );

    expect(isRetryableSeedDatabaseError(error)).toBe(true);
  });

  it('treats Neon closed connections as retryable', () => {
    const error = new Error('Failed query');
    error.cause = new Error('connection closed');

    expect(isRetryableSeedDatabaseError(error)).toBe(true);
  });

  it('does not retry non-transient validation failures', () => {
    const error = new Error('duplicate key value violates unique constraint');

    expect(isRetryableSeedDatabaseError(error)).toBe(false);
  });

  it('detects missing promo_downloads relation errors', () => {
    const error = Object.assign(
      new Error('relation "promo_downloads" does not exist'),
      { code: '42P01' }
    );

    expect(isMissingPromoDownloadsRelationError(error)).toBe(true);
  });

  it('does not treat unrelated missing relations as promo_downloads errors', () => {
    const error = Object.assign(
      new Error('relation "creator_profiles" does not exist'),
      { code: '42P01' }
    );

    expect(isMissingPromoDownloadsRelationError(error)).toBe(false);
  });
});
