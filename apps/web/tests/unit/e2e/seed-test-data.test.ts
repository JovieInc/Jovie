import { PgDialect } from 'drizzle-orm/pg-core';
import { describe, expect, it } from 'vitest';
import {
  buildPromoDownloadRightsAttestationSeed,
  buildPublicReleaseApprovalSeedRow,
  isMissingPromoDownloadsRelationError,
  isRetryableSeedDatabaseError,
} from '../../seed-test-data';

describe('buildPromoDownloadRightsAttestationSeed', () => {
  it('skips ownerless profiles that cannot create a valid attestation', () => {
    expect(
      buildPromoDownloadRightsAttestationSeed(null, new Date())
    ).toBeNull();
  });

  it('preserves immutable attestation fields when an attested fixture exists', () => {
    const attestedAt = new Date('2026-10-01T00:00:00.000Z');
    const seed = buildPromoDownloadRightsAttestationSeed(
      '00000000-0000-4000-8000-000000000001',
      attestedAt
    );

    expect(seed).not.toBeNull();
    if (!seed) {
      throw new Error('expected an owned promo-download seed');
    }

    const dialect = new PgDialect();
    const attesterQuery = dialect.sqlToQuery(
      seed.conflictUpdate.rightsControlAttestedBy
    );
    const timestampQuery = dialect.sqlToQuery(
      seed.conflictUpdate.rightsControlAttestedAt
    );

    expect(attesterQuery.sql).toContain(
      'CASE WHEN "promo_downloads"."rights_control_attested" THEN "promo_downloads"."rights_control_attested_by" ELSE $1 END'
    );
    expect(attesterQuery.params).toEqual([
      '00000000-0000-4000-8000-000000000001',
    ]);
    expect(timestampQuery.sql).toContain(
      'CASE WHEN "promo_downloads"."rights_control_attested" THEN "promo_downloads"."rights_control_attested_at" ELSE $1 END'
    );
    expect(timestampQuery.params).toEqual([attestedAt]);
    expect(seed.values).toMatchObject({
      isActive: true,
      rightsControlAttested: true,
      rightsControlAttestedBy: '00000000-0000-4000-8000-000000000001',
      rightsControlAttestedAt: attestedAt,
    });
  });
});

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
