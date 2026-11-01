// @vitest-environment node
/**
 * One composed fixture for the outbound claim link: approve a synthetic
 * candidate, run the real ingest and route code against a real Postgres
 * (PGlite with every production migration), follow the generated link through
 * the real claim route, resume auth from the signed cookie and claim.
 *
 * Mocked: only outside I/O (page extraction, avatar hosting, enrichment queues,
 * rate limit, analytics, cache). The paid step is covered by the billing tests.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/pglite';
import { NextRequest } from 'next/server';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

const holder = vi.hoisted(() => ({
  db: null as unknown,
  client: null as unknown,
}));

vi.mock('server-only', () => ({}));
vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
  revalidateTag: vi.fn(),
  unstable_cache: (fn: unknown) => fn,
}));
vi.mock('next/headers', () => ({
  cookies: async () => ({ set: vi.fn(), get: vi.fn(), delete: vi.fn() }),
  headers: async () => new Headers(),
}));
vi.mock('@/lib/db', () => ({
  get db() {
    return holder.db;
  },
  applyRlsTransactionUser: async () => undefined,
  applyRlsSessionUser: async () => undefined,
}));
vi.mock('@/lib/db/legacy-transaction', () => ({
  runLegacyDbTransaction: (fn: (tx: unknown) => unknown) =>
    (holder.db as { transaction: (f: unknown) => unknown }).transaction(fn),
}));
vi.mock('@/lib/ingestion/session', () => ({
  withSystemIngestionSession: (fn: (tx: unknown) => unknown) =>
    (holder.db as { transaction: (f: unknown) => unknown }).transaction(fn),
}));
vi.mock('@/lib/env-server', () => ({
  env: {
    URL_ENCRYPTION_KEY: 'test-key-test-key-test-key-test-key',
    RESEND_API_KEY: 'test-resend-key',
  },
  isSecureEnv: () => false,
}));
vi.mock('@/lib/error-tracking', () => ({ captureError: vi.fn() }));
vi.mock('@/lib/server-analytics', () => ({
  trackServerEvent: vi.fn().mockResolvedValue({ ok: true }),
}));
vi.mock('@/lib/cache/profile', () => ({ invalidateProfileCache: vi.fn() }));
vi.mock('@/lib/rate-limit', () => ({
  allowIfRateLimitBackendDegraded: (r: unknown) => r,
  claimTokenAccessLimiter: { limit: async () => ({ success: true }) },
  createRateLimitHeaders: () => ({}),
  getClientIP: () => '203.0.113.9',
}));
vi.mock('@/lib/acquisition/artist-offer-funnel.server', () => ({
  recordArtistOfferStage: vi.fn(),
}));
vi.mock('@/lib/ingestion/flows/full-extraction-flow', () => ({
  fetchFullExtractionProfile: async () => ({
    displayName: 'Synthetic Claim Artist',
    avatarUrl: null,
    links: [
      {
        url: 'https://open.spotify.com/artist/4Uwpa6zW3zzCSQvooQNksm',
        title: 'Spotify',
      },
    ],
  }),
}));
vi.mock('@/lib/leads/build-lead-catalog.server', () => ({
  buildLeadProfileCatalog: async () => ({ status: 'skipped' }),
}));
vi.mock('@/lib/ingestion/flows/avatar-hosting', () => ({
  resolveHostedAvatarUrl: async () => 'https://blob.test/avatar.avif',
}));
vi.mock('@/lib/ingestion/jobs', () => ({
  enqueueDspArtistDiscoveryJob: vi.fn().mockResolvedValue(undefined),
  enqueueMusicFetchEnrichmentJob: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('@/lib/profile-surfaces/reconciliation', () => ({
  reconcileProfileSurfaces: vi.fn(),
}));
vi.mock('@/lib/profile/profile-theme.server', () => ({
  buildThemeWithProfileAccent: async () => ({}),
}));
vi.mock('@/lib/leads/spotify-enrich-lead', () => ({
  trySpotifyEnrichment: vi.fn(),
  spotifyEnrichLead: vi.fn(),
}));
vi.mock('@/lib/leads/pipeline-logger', () => ({
  pipelineLog: vi.fn(),
  pipelineWarn: vi.fn(),
}));

import { GET as claimLinkRoute } from '@/app/claim/[token]/route';
import { invalidateProfileCache } from '@/lib/cache/profile';
import { PENDING_CLAIM_COOKIE } from '@/lib/claim/context';
import { claimPrebuiltProfileForUser } from '@/lib/claim/finalize';
import { users } from '@/lib/db/schema/auth';
import { leads } from '@/lib/db/schema/leads';
import { creatorProfiles } from '@/lib/db/schema/profiles';
import { handleReingestProfile } from '@/lib/ingestion/flows/reingest-flow';
import { approveLead } from '@/lib/leads/approve-lead';
import { withLeadBuildRelease } from '@/lib/leads/lead-build-hold';
import { resolveLeadClaimToken } from '@/lib/leads/lead-claim-token';
import { outreachApprovedWhere } from '@/lib/leads/outreach-eligible-status';
import { routeLead } from '@/lib/leads/route-lead';
import { hashClaimToken } from '@/lib/security/claim-token';
import { holdLeadBuiltProfileInTx } from '@/lib/services/profile/mutations';

type TestDb = ReturnType<typeof drizzle>;
const db = () => holder.db as TestDb;

beforeAll(async () => {
  const client = new PGlite();
  holder.client = client;
  const dir = path.join(process.cwd(), 'drizzle', 'migrations');
  const journal = JSON.parse(
    readFileSync(path.join(dir, 'meta', '_journal.json'), 'utf8')
  );
  for (const entry of journal.entries) {
    await client.exec(
      readFileSync(path.join(dir, `${entry.tag}.sql`), 'utf8').replaceAll(
        '--> statement-breakpoint',
        ''
      )
    );
  }
  holder.db = drizzle(client);
}, 280_000);

afterAll(async () => (holder.client as PGlite).close());

async function insertLead(handle = 'syntheticclaimartist') {
  const [lead] = await db()
    .insert(leads)
    .values({
      linktreeHandle: handle,
      linktreeUrl: `https://linktr.ee/${handle}`,
      discoverySource: 'manual' as never,
      displayName: 'Synthetic Claim Artist',
      contactEmail: 'artist@example.com',
      hasSpotifyLink: true,
      spotifyUrl: 'https://open.spotify.com/artist/4Uwpa6zW3zzCSQvooQNksm',
      status: 'qualified',
    })
    .returning();
  return lead;
}

describe('outbound claim link, composed', () => {
  it('approve -> ingest -> route yields ONE canonical token, hash and expiry; the generated link claims', async () => {
    const lead = await insertLead();
    const result = await approveLead(lead);
    expect(result.ingestion?.success).toBe(true);
    expect(result.routing?.route).toBeTruthy();

    const [stored] = await db()
      .select()
      .from(leads)
      .where(eq(leads.id, lead.id));
    const [profile] = await db()
      .select()
      .from(creatorProfiles)
      .where(eq(creatorProfiles.id, stored.creatorProfileId as string));

    // One token across lead and profile, stored hashed: the lead never holds
    // the plaintext, which is derived on demand from the hash inputs.
    expect(stored.claimToken).toBeNull();
    const token = (await resolveLeadClaimToken(stored)) as string;
    expect(token).toBeTruthy();
    const hash = await hashClaimToken(token);
    expect(stored.claimTokenHash).toBe(hash);
    expect(profile.claimToken).toBe(hash);
    expect(profile.claimTokenExpiresAt?.getTime()).toBe(
      stored.claimTokenExpiresAt?.getTime()
    );

    // The lead stays approved so the outreach batch can select it.
    expect(['approved', 'ingested']).toContain(stored.status);
    expect(stored.approvedAt).not.toBeNull();
    const selectable = await db()
      .select({ id: leads.id })
      .from(leads)
      .where(outreachApprovedWhere());
    expect(selectable.map(row => row.id)).toContain(lead.id);

    // Follow the exact link the email carries.
    const response = await claimLinkRoute(
      new NextRequest(`https://jov.ie/claim/${token}`),
      { params: Promise.resolve({ token }) }
    );
    const location = response.headers.get('location') ?? '';
    // The lead-built page is private until claimed, so the link starts the
    // claim directly instead of previewing a page nobody may see.
    expect(profile.isPublic).toBe(false);
    expect(location).toContain(`/${profile.usernameNormalized}/claim?token=`);
    expect(location).toContain('next=auth');

    // Interrupted auth: the signed cookie is all that survives; resume with it.
    const cookie = response.cookies.get(PENDING_CLAIM_COOKIE)?.value ?? '';
    const payload = JSON.parse(
      Buffer.from(cookie.split('.')[0], 'base64url').toString('utf8')
    );
    expect(payload.claimTokenHash).toBe(hash);
    expect(payload.leadId).toBe(lead.id);

    const [user] = await db()
      .insert(users)
      .values({
        clerkId: 'user_claim_fixture',
        email: 'artist@example.com',
        userStatus: 'onboarding_incomplete',
      })
      .returning({ id: users.id });
    const claimed = await db().transaction(tx =>
      claimPrebuiltProfileForUser(tx as never, {
        userId: user.id,
        creatorProfileId: payload.creatorProfileId,
        expectedUsername: payload.username,
        displayName: 'Synthetic Claim Artist',
        source: 'token_backed_onboarding',
        claimTokenHash: payload.claimTokenHash,
      })
    );
    expect(claimed.profileId).toBe(profile.id);

    // Claiming is the release: the page goes public with its owner.
    const [afterClaim] = await db()
      .select({ isPublic: creatorProfiles.isPublic })
      .from(creatorProfiles)
      .where(eq(creatorProfiles.id, profile.id));
    expect(afterClaim.isPublic).toBe(true);
  });

  it('a held lead-built profile cannot be published around the hold', async () => {
    const lead = await insertLead('heldartist');
    const result = await approveLead({ ...lead, linktreeHandle: 'heldartist' });
    const profileId = result.ingestion?.profileId as string;
    await db()
      .update(creatorProfiles)
      .set({ isPublic: true })
      .where(eq(creatorProfiles.id, profileId));
    const [row] = await db()
      .select({ isPublic: creatorProfiles.isPublic })
      .from(creatorProfiles)
      .where(eq(creatorProfiles.id, profileId));
    expect(row.isPublic).toBe(false);
  });

  it('re-ingest applies the hold through the profile owner and preserves other settings', async () => {
    const lead = await insertLead('reheldartist');
    const result = await approveLead({
      ...lead,
      linktreeHandle: 'reheldartist',
    });
    const profileId = result.ingestion?.profileId as string;
    const settings = { customKey: 'preserved' };
    await db()
      .update(creatorProfiles)
      .set({ settings, isPublic: true })
      .where(eq(creatorProfiles.id, profileId));
    const [existing] = await db()
      .select()
      .from(creatorProfiles)
      .where(eq(creatorProfiles.id, profileId));

    const response = await handleReingestProfile({
      existing,
      extraction: {
        displayName: 'Synthetic Claim Artist',
        avatarUrl: 'https://blob.test/avatar.avif',
        links: [],
      },
      displayName: 'Synthetic Claim Artist',
      leadHold: true,
    });
    expect(await response.json()).toMatchObject({
      ok: true,
      quarantined: true,
    });
    const [profile] = await db()
      .select()
      .from(creatorProfiles)
      .where(eq(creatorProfiles.id, profileId));
    expect(profile.isPublic).toBe(false);
    expect(profile.settings).toMatchObject({
      ...settings,
      leadBuild: { held: true, reason: 'lead_built_uncertified' },
    });
    expect(vi.mocked(invalidateProfileCache)).toHaveBeenCalledWith(
      'reheldartist'
    );
  });

  it('the domain hold rolls back with the supplied transaction and rejects missing profiles', async () => {
    const [legacy] = await db()
      .insert(creatorProfiles)
      .values({
        creatorType: 'artist',
        username: 'rollbackholdartist',
        usernameNormalized: 'rollbackholdartist',
        settings: {},
        isPublic: true,
      })
      .returning();
    const profileId = legacy.id;

    await expect(
      db().transaction(async tx => {
        await holdLeadBuiltProfileInTx(tx as never, profileId);
        throw new Error('injected rollback');
      })
    ).rejects.toThrow('injected rollback');
    const [profile] = await db()
      .select()
      .from(creatorProfiles)
      .where(eq(creatorProfiles.id, profileId));
    expect(profile.isPublic).toBe(true);
    expect(profile.settings).toEqual({});
    await expect(
      holdLeadBuiltProfileInTx(
        db() as never,
        '00000000-0000-4000-8000-000000000000'
      )
    ).rejects.toThrow('Lead-built profile not found');
  });

  it('holds legacy profiles whose isClaimed value is null', async () => {
    const [legacy] = await db()
      .insert(creatorProfiles)
      .values({
        creatorType: 'artist',
        username: 'nullclaimholdartist',
        usernameNormalized: 'nullclaimholdartist',
        settings: {},
        isClaimed: null,
        isPublic: true,
      })
      .returning();
    const profileId = legacy.id;
    await expect(
      holdLeadBuiltProfileInTx(db() as never, profileId)
    ).resolves.toBe(true);
    const [profile] = await db()
      .select()
      .from(creatorProfiles)
      .where(eq(creatorProfiles.id, profileId));
    expect(profile.isPublic).toBe(false);
    expect(profile.settings).toMatchObject({ leadBuild: { held: true } });
  });

  it.each(['claimed', 'certified'] as const)(
    'does not re-hold a profile %s while extraction was in flight',
    async state => {
      const handle = `holdrace${state}`;
      const lead = await insertLead(handle);
      const result = await approveLead({ ...lead, linktreeHandle: handle });
      const profileId = result.ingestion?.profileId as string;
      const [existing] = await db()
        .select()
        .from(creatorProfiles)
        .where(eq(creatorProfiles.id, profileId));
      const settings =
        state === 'certified'
          ? withLeadBuildRelease(
              existing.settings,
              new Date('2026-10-29T12:00:00Z')
            )
          : existing.settings;
      await db()
        .update(creatorProfiles)
        .set({ settings, isPublic: true, isClaimed: state === 'claimed' })
        .where(eq(creatorProfiles.id, profileId));

      const response = await handleReingestProfile({
        existing,
        extraction: {
          displayName: 'Synthetic Claim Artist',
          avatarUrl: null,
          links: [],
        },
        displayName: 'Synthetic Claim Artist',
        leadHold: true,
      });
      expect(await response.json()).toMatchObject({
        ok: true,
        quarantined: false,
      });
      if (state === 'certified') {
        // A background task may finish with settings read before certification.
        await db()
          .update(creatorProfiles)
          .set({ settings: existing.settings })
          .where(eq(creatorProfiles.id, profileId));
      }
      const [profile] = await db()
        .select()
        .from(creatorProfiles)
        .where(eq(creatorProfiles.id, profileId));
      expect(profile.isPublic).toBe(true);
      expect(profile.settings).toEqual(settings);
    }
  );

  it('an ordinary settings replacement cannot erase an active hold and publish the profile', async () => {
    const lead = await insertLead('holdsettingsartist');
    const result = await approveLead({
      ...lead,
      linktreeHandle: 'holdsettingsartist',
    });
    const profileId = result.ingestion?.profileId as string;
    await db()
      .update(creatorProfiles)
      .set({ settings: { featuredPlaylistFallbackCandidate: null } })
      .where(eq(creatorProfiles.id, profileId));
    await db()
      .update(creatorProfiles)
      .set({ isPublic: true })
      .where(eq(creatorProfiles.id, profileId));
    const [profile] = await db()
      .select()
      .from(creatorProfiles)
      .where(eq(creatorProfiles.id, profileId));
    expect(profile.isPublic).toBe(false);
    expect(profile.settings).toMatchObject({
      featuredPlaylistFallbackCandidate: null,
      leadBuild: { held: true, reason: 'lead_built_uncertified' },
    });
  });

  it('re-routing after the profile token changed re-syncs the profile to the lead token', async () => {
    const lead = await insertLead('resyncartist');
    await db()
      .update(leads)
      .set({ linktreeHandle: 'resyncartist' })
      .where(eq(leads.id, lead.id));
    const result = await approveLead({
      ...lead,
      linktreeHandle: 'resyncartist',
    });
    const profileId = result.ingestion?.profileId as string;
    await db()
      .update(creatorProfiles)
      .set({ claimToken: 'f'.repeat(64) })
      .where(eq(creatorProfiles.id, profileId));
    await routeLead(lead.id);
    const [stored] = await db()
      .select()
      .from(leads)
      .where(eq(leads.id, lead.id));
    const [profile] = await db()
      .select()
      .from(creatorProfiles)
      .where(eq(creatorProfiles.id, profileId));
    expect(profile.claimToken).toBe(stored.claimTokenHash);
  });
});
