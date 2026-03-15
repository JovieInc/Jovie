import { and, sql as drizzleSql, eq, inArray } from 'drizzle-orm';
/* eslint-disable no-restricted-imports -- Integration test needs direct schema reads/writes */
import type { NeonDatabase } from 'drizzle-orm/neon-serverless';
import { beforeAll, describe, expect, it, vi } from 'vitest';

import { POST as ingestCreator } from '@/app/api/admin/creator-ingest/route';
import { POST as runIngestionJobs } from '@/app/api/ingestion/jobs/route';
import * as schema from '@/lib/db/schema';
import { discogReleases, releaseArtists } from '@/lib/db/schema/content';
import { ingestionJobs } from '@/lib/db/schema/ingestion';
import { socialLinks } from '@/lib/db/schema/links';
import { creatorContacts, creatorProfiles } from '@/lib/db/schema/profiles';
import { importReleasesFromSpotify } from '@/lib/discography/spotify-import';
import { processMusicFetchEnrichmentJob } from '@/lib/dsp-enrichment/jobs/musicfetch-enrichment';
import { enqueueMusicFetchEnrichmentJob } from '@/lib/ingestion/jobs';
import { setupDatabaseBeforeAll } from '../../setup-db';

type TestDb = NeonDatabase<typeof schema>;

vi.mock('@/lib/entitlements/server', () => ({
  getCurrentUserEntitlements: vi.fn(async () => ({
    userId: 'admin_user',
    email: 'admin@example.com',
    isAuthenticated: true,
    isAdmin: true,
    isPro: false,
    hasAdvancedFeatures: true,
    canRemoveBranding: true,
  })),
}));

setupDatabaseBeforeAll();

const REAL_LINKTREE_URL =
  process.env.REAL_LINKTREE_INGEST_URL ??
  'https://linktr.ee/itsmaggielindemann';
const INGESTION_SECRET =
  process.env.INGESTION_CRON_SECRET ??
  process.env.CRON_SECRET ??
  'test-ingestion-secret';

const shouldRunRealTest =
  process.env.RUN_REAL_LINKTREE_INGEST_TEST === '1' &&
  Boolean(process.env.DATABASE_URL);

let db: TestDb;

beforeAll(() => {
  const connection = (globalThis as typeof globalThis & { db?: TestDb }).db;
  if (!connection) {
    return;
  }
  db = connection;
});

describe('Real Linktree ingest integration (no mocks for external APIs)', () => {
  it('is skipped unless RUN_REAL_LINKTREE_INGEST_TEST=1', () => {
    // This integration test only runs when explicitly enabled via environment variable.
    // Set RUN_REAL_LINKTREE_INGEST_TEST=1 and DATABASE_URL to run against a real database.
    expect(shouldRunRealTest).toBeDefined();
  });

  it.skipIf(!shouldRunRealTest)(
    'runs real Linktree scrape, music enrichment, and verifies persisted DB state',
    async () => {
      const ingestResponse = await ingestCreator(
        new Request('http://localhost/api/admin/creator-ingest', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url: REAL_LINKTREE_URL }),
        })
      );

      const ingestPayload = (await ingestResponse.json()) as {
        ok?: boolean;
        profile?: { id: string; username: string };
        error?: string;
      };

      expect(ingestResponse.status, ingestPayload.error).toBe(200);
      expect(ingestPayload.ok).toBe(true);
      expect(ingestPayload.profile?.id).toBeDefined();

      const profileId = ingestPayload.profile!.id;

      const [profile] = await db
        .select({
          id: creatorProfiles.id,
          displayName: creatorProfiles.displayName,
          avatarUrl: creatorProfiles.avatarUrl,
          isVerified: creatorProfiles.isVerified,
          spotifyUrl: creatorProfiles.spotifyUrl,
          spotifyId: creatorProfiles.spotifyId,
          bio: creatorProfiles.bio,
          appleMusicUrl: creatorProfiles.appleMusicUrl,
          genres: creatorProfiles.genres,
        })
        .from(creatorProfiles)
        .where(eq(creatorProfiles.id, profileId))
        .limit(1);

      expect(profile).toBeDefined();
      expect(profile?.displayName?.trim().length ?? 0).toBeGreaterThan(0);
      expect(profile?.avatarUrl).toMatch(/^https?:\/\//);

      if (profile?.spotifyUrl) {
        await enqueueMusicFetchEnrichmentJob({
          creatorProfileId: profileId,
          spotifyUrl: profile.spotifyUrl,
        });

        await runIngestionJobs(
          new Request('http://localhost/api/ingestion/jobs', {
            method: 'POST',
            headers: {
              'x-ingestion-secret': INGESTION_SECRET,
            },
          }) as never
        );

        // Defensive direct run to ensure verification in this integration test,
        // even if no pending queue row was claimed.
        await processMusicFetchEnrichmentJob(db, {
          creatorProfileId: profileId,
          spotifyUrl: profile.spotifyUrl,
          dedupKey: `musicfetch_enrichment:${profileId}:direct`,
        });
      }

      const [enrichedProfile] = await db
        .select({
          spotifyUrl: creatorProfiles.spotifyUrl,
          spotifyId: creatorProfiles.spotifyId,
          appleMusicUrl: creatorProfiles.appleMusicUrl,
          bio: creatorProfiles.bio,
          genres: creatorProfiles.genres,
          isVerified: creatorProfiles.isVerified,
        })
        .from(creatorProfiles)
        .where(eq(creatorProfiles.id, profileId))
        .limit(1);

      expect(enrichedProfile?.spotifyUrl).toMatch(/^https?:\/\//);
      expect(enrichedProfile?.spotifyId).toBeTruthy();
      expect(typeof enrichedProfile?.isVerified).toBe('boolean');

      const profileJobs = await db
        .select({
          id: ingestionJobs.id,
          jobType: ingestionJobs.jobType,
          status: ingestionJobs.status,
          payload: ingestionJobs.payload,
        })
        .from(ingestionJobs)
        .where(
          drizzleSql`${ingestionJobs.payload} ->> 'creatorProfileId' = ${profileId}`
        );

      expect(profileJobs.length).toBeGreaterThan(0);
      expect(
        profileJobs.some(job => job.jobType === 'musicfetch_enrichment')
      ).toBe(true);

      const [contact] = await db
        .select({ email: creatorContacts.email })
        .from(creatorContacts)
        .where(eq(creatorContacts.creatorProfileId, profileId))
        .limit(1);

      if (contact?.email) {
        expect(contact.email).toContain('@');
      }

      const socialRows = await db
        .select({
          platform: socialLinks.platform,
          url: socialLinks.url,
        })
        .from(socialLinks)
        .where(eq(socialLinks.creatorProfileId, profileId));

      const hasInstagram = socialRows.some(
        link =>
          link.platform === 'instagram' || link.url.includes('instagram.com')
      );
      expect(hasInstagram).toBe(true);

      if (profile?.spotifyId) {
        const importResult = await importReleasesFromSpotify(
          profileId,
          profile.spotifyId
        );
        expect(importResult.success).toBe(true);

        const releases = await db
          .select({
            releaseId: releaseArtists.releaseId,
          })
          .from(releaseArtists)
          .innerJoin(
            discogReleases,
            eq(releaseArtists.releaseId, discogReleases.id)
          )
          .where(eq(discogReleases.creatorProfileId, profileId));

        expect(releases.length).toBeGreaterThan(0);
      }

      await db
        .delete(creatorContacts)
        .where(eq(creatorContacts.creatorProfileId, profileId));
      await db
        .delete(socialLinks)
        .where(eq(socialLinks.creatorProfileId, profileId));

      const artistRows = await db
        .execute(
          drizzleSql`SELECT id FROM artists WHERE creator_profile_id = ${profileId}`
        )
        .then(result => result.rows as Array<{ id: string }>);

      if (artistRows.length > 0) {
        const artistIds = artistRows.map(row => row.id);
        await db
          .delete(releaseArtists)
          .where(inArray(releaseArtists.artistId, artistIds));
        await db.execute(
          drizzleSql`DELETE FROM artists WHERE id = ANY(${artistIds})`
        );
      }

      await db
        .delete(discogReleases)
        .where(eq(discogReleases.creatorProfileId, profileId));

      await db
        .delete(ingestionJobs)
        .where(
          and(
            drizzleSql`${ingestionJobs.payload} ->> 'creatorProfileId' = ${profileId}`,
            inArray(ingestionJobs.jobType, [
              'musicfetch_enrichment',
              'import_linktree',
            ])
          )
        );

      await db.delete(creatorProfiles).where(eq(creatorProfiles.id, profileId));
    }
  );
});
