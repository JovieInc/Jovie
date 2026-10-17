import { drizzle as createSeedDatabase } from 'drizzle-orm/neon-http';
import { drizzle } from 'drizzle-orm/pg-proxy';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { promoDownloads } from '@/lib/db/schema/promo-downloads';
import {
  applyPromoDownloadSeedWrite,
  buildPromoDownloadSeedConflictUpdate,
  buildPublicReleaseApprovalSeedRow,
  isMissingPromoDownloadsRelationError,
  isRetryableSeedDatabaseError,
  type PromoDownloadSeedWrite,
  seedReadyCreatorReleaseFixtures,
  seedTestData,
} from '../../seed-test-data';

vi.mock('drizzle-orm/neon-http', () => ({ drizzle: vi.fn() }));

function assertPromoDownloadRightsAllowed(
  previous: PromoDownloadSeedWrite | null,
  next: PromoDownloadSeedWrite
) {
  if (previous?.rightsControlAttested) {
    if (
      next.rightsControlAttested !== previous.rightsControlAttested ||
      next.rightsControlAttestedBy !== previous.rightsControlAttestedBy ||
      next.rightsControlAttestedAt?.getTime() !==
        previous.rightsControlAttestedAt?.getTime()
    ) {
      throw new Error('promo download rights attestation is immutable');
    }
  }
  if (
    next.rightsControlAttested &&
    (next.rightsControlAttestedBy === null ||
      next.rightsControlAttestedAt === null)
  ) {
    throw new Error('rights attestation requires actor and timestamp');
  }
  if (next.isActive && !next.rightsControlAttested) {
    throw new Error('active downloads require full-control attestation');
  }
}

function writePromoDownloadSeed(
  existing: PromoDownloadSeedWrite | null,
  incoming: PromoDownloadSeedWrite
) {
  const next = applyPromoDownloadSeedWrite(existing, incoming);
  assertPromoDownloadRightsAllowed(existing, next);
  return next;
}

describe('promo fixture reruns', () => {
  it('generates conflict SQL that backfills a missing receipt and keeps an existing one', () => {
    const db = drizzle(async () => ({ rows: [] }));
    for (const now of [new Date('2026-10-01'), new Date('2026-10-02')]) {
      const query = db
        .insert(promoDownloads)
        .values({
          creatorProfileId: '00000000-0000-4000-8000-000000000001',
          releaseId: '00000000-0000-4000-8000-000000000002',
          title: 'Fixture',
          slug: 'fixture',
          fileUrl: 'fixture.mp3',
          fileName: 'fixture.mp3',
          fileMimeType: 'audio/mpeg',
          rightsControlAttested: true,
          rightsControlAttestedBy: '00000000-0000-4000-8000-000000000003',
          rightsControlAttestedAt: now,
        })
        .onConflictDoUpdate({
          target: [promoDownloads.releaseId, promoDownloads.slug],
          set: buildPromoDownloadSeedConflictUpdate(now),
        })
        .toSQL();
      const update = query.sql.split(' do update set ')[1] ?? '';
      expect(update).toContain('"is_active"');
      expect(update).toContain('"updated_at"');
      for (const column of [
        'rights_control_attested',
        'rights_control_attested_by',
        'rights_control_attested_at',
      ] as const) {
        expect(update).toContain(
          `CASE WHEN promo_downloads.rights_control_attested THEN promo_downloads.${column} ELSE excluded.${column} END`
        );
      }
      expect(query.sql.split(' on conflict ')[0]).toContain(
        '"rights_control_attested_at"'
      );
    }
  });

  it('reactivates an unattested row and accepts a second seed run', () => {
    const attestedAt = new Date('2026-10-02T00:00:00.000Z');
    const rerunAt = new Date('2026-10-03T00:00:00.000Z');
    const incoming = {
      isActive: true,
      rightsControlAttested: true,
      rightsControlAttestedBy: '00000000-0000-4000-8000-000000000003',
      rightsControlAttestedAt: attestedAt,
    } satisfies PromoDownloadSeedWrite;
    const unattested = {
      isActive: false,
      rightsControlAttested: false,
      rightsControlAttestedBy: null,
      rightsControlAttestedAt: null,
    } satisfies PromoDownloadSeedWrite;

    expect(() =>
      assertPromoDownloadRightsAllowed(unattested, {
        ...unattested,
        isActive: true,
      })
    ).toThrow('active downloads require full-control attestation');

    const repaired = writePromoDownloadSeed(unattested, incoming);
    const rerun = writePromoDownloadSeed(repaired, {
      ...incoming,
      rightsControlAttestedAt: rerunAt,
    });

    expect(repaired).toEqual(incoming);
    expect(rerun).toEqual(repaired);
    expect(rerun.rightsControlAttestedAt).toEqual(attestedAt);

    const inserted = writePromoDownloadSeed(null, incoming);
    const insertedAgain = writePromoDownloadSeed(inserted, {
      ...incoming,
      rightsControlAttestedAt: rerunAt,
    });
    expect(insertedAgain).toEqual(inserted);
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

describe('ready creator release fixtures', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.clearAllMocks();
  });

  it.each(['preview', 'production'])(
    'refuses the isolated mode on %s deployments',
    async environment => {
      vi.stubEnv('VERCEL_ENV', environment);
      vi.stubEnv('E2E_USE_TEST_AUTH_BYPASS', '1');
      await expect(
        seedTestData({ readyCreatorReleasesOnly: true })
      ).rejects.toThrow(
        'Ready creator release seeding requires local test auth bypass'
      );
    }
  );

  it('requires explicit bypass and a database for isolated seeding', async () => {
    vi.stubEnv('VERCEL_ENV', 'development');
    vi.stubEnv('E2E_USE_TEST_AUTH_BYPASS', '0');
    await expect(
      seedTestData({ readyCreatorReleasesOnly: true })
    ).rejects.toThrow(
      'Ready creator release seeding requires local test auth bypass'
    );
    vi.stubEnv('E2E_USE_TEST_AUTH_BYPASS', '1');
    vi.stubEnv('DATABASE_URL', '');
    vi.stubEnv('DATABASE_URL_DIRECT', '');
    await expect(
      seedTestData({ readyCreatorReleasesOnly: true })
    ).rejects.toThrow(
      'DATABASE_URL is required to seed ready creator releases'
    );
  });

  it('seeds releases and approvals on the prepared persona active profile', async () => {
    const profileId = '00000000-0000-4000-8000-000000000001';
    const statements: Array<{ query: string; params: unknown[] }> = [];
    let releaseNumber = 0;
    const db = drizzle(async (query, params) => {
      statements.push({ query, params });
      if (query.includes('from "users"')) return { rows: [[profileId]] };
      if (query.startsWith('insert into "discog_recordings"')) {
        return { rows: [['recording-fixture']] };
      }
      if (query.startsWith('insert into "discog_releases"')) {
        releaseNumber += 1;
        return { rows: [[`release-${releaseNumber}`]] };
      }
      return { rows: [] };
    });
    vi.stubEnv('VERCEL_ENV', 'development');
    vi.stubEnv('E2E_USE_TEST_AUTH_BYPASS', '1');
    vi.stubEnv(
      'DATABASE_URL',
      'postgresql://fixture:fixture@localhost/fixture'
    );
    vi.mocked(createSeedDatabase).mockReturnValue(
      db as unknown as ReturnType<typeof createSeedDatabase>
    );
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      await expect(
        seedTestData({ readyCreatorReleasesOnly: true })
      ).resolves.toEqual({ success: true });
    } finally {
      log.mockRestore();
      warn.mockRestore();
    }

    const lookup = statements[0];
    expect(lookup.query).toContain('"users"."active_profile_id"');
    expect(lookup.query).toContain(
      '"creator_profiles"."user_id" = "users"."id"'
    );
    expect(lookup.params).toContain('browse-ready+clerk_test@jov.ie');
    const releases = statements.filter(({ query }) =>
      query.startsWith('insert into "discog_releases"')
    );
    expect(releases.length).toBeGreaterThan(0);
    for (const release of releases) {
      expect(release.params).toContain(profileId);
      expect(release.query).toContain('on conflict');
    }
    const approvals = statements.filter(({ query }) =>
      query.startsWith('insert into "library_asset_approval_statuses"')
    );
    expect(approvals).toHaveLength(releases.length);
    expect(approvals.every(({ params }) => params.includes(profileId))).toBe(
      true
    );
  });

  it('fails before writing when the persona has no owned active profile', async () => {
    const request = vi.fn(async () => ({ rows: [] }));
    const db = drizzle(request);
    await expect(
      seedReadyCreatorReleaseFixtures(
        db as unknown as Parameters<typeof seedReadyCreatorReleaseFixtures>[0]
      )
    ).rejects.toThrow(
      'Prepare the creator-ready persona before seeding releases'
    );
    expect(request).toHaveBeenCalledTimes(1);
  });
});
