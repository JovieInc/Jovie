import {
  getTableConfig,
  type PgColumn,
  type PgTable,
} from 'drizzle-orm/pg-core';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import type { DbType } from '@/lib/db';
import {
  clickEvents,
  notificationSubscriptions,
  tips,
} from '@/lib/db/schema/analytics';
import { users } from '@/lib/db/schema/auth';
import {
  artists,
  discogReleases,
  providerLinks,
  releaseArtists,
} from '@/lib/db/schema/content';
import { feedbackDecisions, feedbackItems } from '@/lib/db/schema/feedback';
import { socialLinks } from '@/lib/db/schema/links';
import { pixelEvents } from '@/lib/db/schema/pixels';
import { preSaveTokens } from '@/lib/db/schema/pre-save';
import { creatorProfiles } from '@/lib/db/schema/profiles';
import { waitlistAuditLogs, waitlistEntries } from '@/lib/db/schema/waitlist';
import { encodeSpotifyPreSaveState } from '@/lib/pre-save/state';
import { hashWaitlistInviteToken } from '@/lib/waitlist/tokens';

/**
 * JOV-8790 standing ratchet.
 *
 * Production and preview disable `/api/dev/test-auth`, and that bypass writes
 * a clerk_id. This fixture is a Better Auth app user whose clerk_id is NULL.
 * The converted handlers must return data for `users.id`, which is what
 * getCachedAuth returns. A clerk_id equality match returns no row.
 */

const USER_ID = '7b4b948f-9720-4c5f-98da-8a7335015da9';
const PROFILE_ID = '11111111-1111-4111-8111-111111111111';
const RELEASE_ID = '22222222-2222-4222-8222-222222222222';
const LINK_ID = '33333333-3333-4333-8333-333333333333';
const TIP_ID = '44444444-4444-4444-8444-444444444444';
const PIXEL_ID = '66666666-6666-4666-8666-666666666666';
const CLICK_ID = '77777777-7777-4777-8777-777777777777';
const ENTRY_ID = '88888888-8888-4888-8888-888888888888';
const EMAIL = 'null-clerk-ratchet@test.jovie.com';
const SHOP_URL = 'https://null-clerk-ratchet.myshopify.com';

interface QueryClient {
  exec(query: string): Promise<unknown>;
  query<T extends Record<string, unknown> = Record<string, unknown>>(
    query: string,
    params?: unknown[]
  ): Promise<{ rows: T[] }>;
}

interface FixtureDb {
  execute(query: unknown): Promise<{ rows?: unknown[] }>;
  transaction<T>(
    operation: (tx: FixtureDb) => Promise<T>,
    options?: unknown
  ): Promise<T>;
}

const harness = vi.hoisted(() => ({
  userId: '7b4b948f-9720-4c5f-98da-8a7335015da9',
  db: null as DbType | null,
  client: null as QueryClient | null,
}));

vi.mock('next/cache', () => ({
  unstable_noStore: () => undefined,
  revalidatePath: () => undefined,
  revalidateTag: () => undefined,
}));

vi.mock('@/lib/auth/cached', () => ({
  getCachedAuth: async () => ({
    userId: harness.userId,
    sessionId: 'sess_null_clerk_ratchet',
    orgId: null,
  }),
  getOptionalAuth: async () => ({
    userId: harness.userId,
    sessionId: 'sess_null_clerk_ratchet',
    orgId: null,
  }),
  getFreshAuth: async () => ({
    userId: harness.userId,
    sessionId: 'sess_null_clerk_ratchet',
    orgId: null,
  }),
  getCachedSessionTokenAuth: async () => ({
    userId: harness.userId,
    sessionId: 'sess_null_clerk_ratchet',
    orgId: null,
  }),
  getCachedCurrentUser: async () => null,
}));

vi.mock('@/lib/auth/proxy-state', () => ({
  invalidateProxyUserStateCache: async () => undefined,
}));

vi.mock('@/lib/entitlements/server', () => ({
  getCurrentUserEntitlements: async () => ({
    canAccessAdPixels: true,
    hasAdvancedFeatures: false,
  }),
}));

vi.mock('@/lib/notifications/providers/slack', () => ({
  notifySlackFeedbackSubmission: async () => undefined,
  notifySlackGrowthRequest: async () => undefined,
  notifySlackSmsAccessRequest: async () => undefined,
}));

vi.mock('@/lib/pre-save/spotify', () => ({
  exchangeSpotifyCode: async () => ({
    access_token: 'spotify-access-token',
    refresh_token: 'spotify-refresh-token',
  }),
  fetchSpotifyMe: async () => ({
    id: 'spotify-null-clerk',
    email: 'fan@example.com',
  }),
}));

vi.mock('@/lib/rate-limit', () => ({
  generalLimiter: {
    limit: async () => ({
      success: true,
      limit: 20,
      remaining: 19,
      reset: 0,
    }),
  },
  createRateLimitHeaders: () => ({}),
  getClientIP: () => '127.0.0.1',
}));

vi.mock('@/lib/db', async () => {
  const { PGlite } = await import('@electric-sql/pglite');
  const { drizzle } = await import('drizzle-orm/pglite');
  const { sql } = await import('drizzle-orm');
  const { users: userTable } = await import('@/lib/db/schema/auth');
  const client = new PGlite();
  const db = drizzle(client, { schema: { users: userTable } });
  harness.client = client;
  // Disposable PGlite client, asserted to the Neon DbType production helpers require.
  harness.db = db as unknown as DbType;

  return {
    db,
    applyRlsSessionUser: async (
      database: FixtureDb,
      userId: string
    ): Promise<void> => {
      await database.execute(
        sql`SELECT set_config('app.clerk_user_id', ${userId}, false)`
      );
    },
    applyRlsTransactionUser: async (
      database: FixtureDb,
      userId: string
    ): Promise<void> => {
      await database.execute(
        sql`SELECT set_config('app.clerk_user_id', ${userId}, true)`
      );
    },
    getRlsTransactionSessionSetSql: (userId: string) =>
      sql`SELECT set_config('app.clerk_user_id', ${userId}, true)`,
    resetRlsSession: async (database: FixtureDb): Promise<void> => {
      await database.execute(
        sql`SELECT set_config('app.clerk_user_id', '', false)`
      );
    },
  };
});

function literalDefault(value: unknown): string | null {
  if (value == null) return null;
  if (typeof value === 'string') return `'${value.replace(/'/g, "''")}'`;
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  if (typeof value === 'object' && 'queryChunks' in value) {
    const chunks = (value as { queryChunks: unknown[] }).queryChunks;
    const text = chunks
      .map(chunk => {
        if (
          chunk &&
          typeof chunk === 'object' &&
          'value' in chunk &&
          Array.isArray((chunk as { value: unknown }).value)
        ) {
          return (chunk as { value: string[] }).value.join('');
        }
        return '';
      })
      .join('')
      .trim();
    return text.length > 0 ? text : null;
  }
  if (typeof value === 'object') {
    return `'${JSON.stringify(value).replace(/'/g, "''")}'::jsonb`;
  }
  return null;
}

function columnDdl(column: PgColumn): string {
  const declared = column.getSQLType();
  const enumLike = column.columnType.toLowerCase().includes('enum');
  const sqlType = enumLike
    ? declared.endsWith('[]')
      ? 'text[]'
      : 'text'
    : declared;
  const fallback = literalDefault(column.default);
  return `"${column.name}" ${sqlType}${column.primary ? ' primary key' : ''}${
    column.notNull ? ' not null' : ''
  }${fallback ? ` default ${fallback}` : ''}`;
}

async function ensureTable(table: PgTable): Promise<void> {
  const client = harness.client;
  if (!client) throw new Error('PGlite client was not initialized');
  const config = getTableConfig(table);
  const columns = config.columns.map(column => columnDdl(column)).join(', ');
  await client.exec(
    `CREATE TABLE IF NOT EXISTS "${config.name}" (${columns});`
  );
}

async function rows<T extends Record<string, unknown>>(
  query: string,
  params: unknown[] = []
): Promise<T[]> {
  const client = harness.client;
  if (!client) throw new Error('PGlite client was not initialized');
  const result = await client.query<T>(query, params);
  return result.rows;
}

interface Probe {
  route: string;
  status: number;
  resolved: boolean;
  detail: string;
}

async function readJson(response: Response): Promise<Record<string, unknown>> {
  const body = (await response.json()) as unknown;
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return {};
  }
  return body as Record<string, unknown>;
}

describe('NULL clerk_id Better Auth route resolution (JOV-8790)', () => {
  beforeAll(async () => {
    await import('@/lib/db');
    for (const table of [
      users,
      creatorProfiles,
      socialLinks,
      tips,
      pixelEvents,
      discogReleases,
      artists,
      releaseArtists,
      providerLinks,
      clickEvents,
      preSaveTokens,
      feedbackItems,
      feedbackDecisions,
      waitlistEntries,
      waitlistAuditLogs,
      notificationSubscriptions,
    ]) {
      await ensureTable(table);
    }

    const client = harness.client;
    if (!client) throw new Error('PGlite client was not initialized');
    await client.exec(`
      CREATE UNIQUE INDEX IF NOT EXISTS pre_save_tokens_release_provider_account
      ON pre_save_tokens (release_id, provider, spotify_account_id);

      INSERT INTO users (
        id, clerk_id, better_auth_user_id, email, name, user_status, plan,
        is_admin, is_pro, active_profile_id, updated_at
      ) VALUES (
        '${USER_ID}', NULL, 'ba_null_clerk_ratchet', '${EMAIL}',
        'Null Clerk Ratchet', 'active', 'pro', false, true, '${PROFILE_ID}',
        '2020-01-01T00:00:00Z'
      );

      INSERT INTO creator_profiles (
        id, user_id, username, username_normalized, display_name, creator_type, settings
      ) VALUES (
        '${PROFILE_ID}', '${USER_ID}', 'nullclerk', 'nullclerk',
        'Null Clerk Ratchet', 'artist',
        '{"shopifyUrl":"${SHOP_URL}"}'::jsonb
      );

      INSERT INTO social_links (
        id, creator_profile_id, platform, platform_type, url, sort_order,
        is_active, state, confidence, source_type, version
      ) VALUES (
        '${LINK_ID}', '${PROFILE_ID}', 'spotify', 'dsp',
        'https://open.spotify.com/artist/nullclerk', 0, true, 'active',
        1.00, 'manual', 1
      );

      INSERT INTO tips (
        id, creator_profile_id, amount_cents, currency, payment_intent_id,
        tipper_name, contact_email, status, created_at
      ) VALUES (
        '${TIP_ID}', '${PROFILE_ID}', 2500, 'USD', 'pi_null_clerk_ratchet',
        'Fan', 'fan@example.com', 'completed', NOW()
      );

      INSERT INTO pixel_events (
        id, profile_id, session_id, event_type, forwarding_status, created_at
      ) VALUES (
        '${PIXEL_ID}', '${PROFILE_ID}', 'sess_pixel', 'page_view',
        jsonb_build_object(
          'facebook', jsonb_build_object('status', 'sent', 'sentAt', NOW())
        ),
        NOW()
      );

      INSERT INTO discog_releases (id, creator_profile_id, title, slug)
      VALUES ('${RELEASE_ID}', '${PROFILE_ID}', 'Ratchet Single', 'ratchet-single');

      INSERT INTO click_events (
        id, creator_profile_id, link_type, is_bot, metadata, created_at
      ) VALUES (
        '${CLICK_ID}', '${PROFILE_ID}', 'listen', false,
        '{"contentId":"${RELEASE_ID}","contentType":"release","provider":"spotify"}'::jsonb,
        NOW()
      );
    `);
  }, 60_000);

  it('resolves the seeded user on the converted routes', async () => {
    const { GET: getEarnings } = await import(
      '@/app/api/dashboard/earnings/route'
    );
    const { GET: getShop } = await import('@/app/api/dashboard/shop/route');
    const { GET: getPixelHealth } = await import(
      '@/app/api/dashboard/pixels/health/route'
    );
    const { GET: getReleaseAnalytics } = await import(
      '@/app/api/dashboard/releases/[releaseId]/analytics/route'
    );
    const { POST: postFeedback } = await import('@/app/api/feedback/route');
    const { POST: postGrowth } = await import(
      '@/app/api/growth-access-request/route'
    );
    const { POST: postMax } = await import(
      '@/app/api/max-access-request/route'
    );
    const { POST: postSms } = await import(
      '@/app/api/sms-access-request/route'
    );
    const { POST: postApplePreSave } = await import(
      '@/app/api/pre-save/apple/route'
    );
    const { GET: getSpotifyCallback } = await import(
      '@/app/api/pre-save/spotify/callback/route'
    );
    const { getProfileSocialLinks } = await import(
      '@/app/app/(shell)/dashboard/actions/social-links'
    );
    const { markWaitlistSignedUpInTx } = await import('@/lib/waitlist/signup');
    const { redeemWaitlistInviteToken } = await import('@/lib/waitlist/redeem');

    const probes: Probe[] = [];

    const record = (probe: Probe) => {
      probes.push(probe);
    };

    const legacyMiss = await rows<{ n: number }>(
      'SELECT count(*)::int AS n FROM users WHERE clerk_id = $1',
      [USER_ID]
    );
    const identityHit = await rows<{ n: number }>(
      'SELECT count(*)::int AS n FROM users WHERE id = $1 AND clerk_id IS NULL',
      [USER_ID]
    );
    record({
      route: 'users.id predicate vs users.clerk_id',
      status: 200,
      resolved:
        Number(legacyMiss[0]?.n) === 0 && Number(identityHit[0]?.n) === 1,
      detail: `clerk_id match ${legacyMiss[0]?.n}, users.id + null clerk_id ${identityHit[0]?.n}`,
    });

    const earnings = await getEarnings();
    const earningsBody = await readJson(earnings);
    const stats = earningsBody.stats as
      | { totalRevenueCents?: number }
      | undefined;
    record({
      route: 'GET /api/dashboard/earnings',
      status: earnings.status,
      resolved: earnings.status === 200 && stats?.totalRevenueCents === 2500,
      detail: JSON.stringify(earningsBody.stats ?? earningsBody.error),
    });

    const shop = await getShop();
    const shopBody = await readJson(shop);
    record({
      route: 'GET /api/dashboard/shop',
      status: shop.status,
      resolved: shop.status === 200 && shopBody.shopifyUrl === SHOP_URL,
      detail: String(shopBody.shopifyUrl ?? shopBody.error),
    });

    const pixels = await getPixelHealth();
    const pixelsBody = await readJson(pixels);
    const facebook = (
      pixelsBody.platforms as
        | { facebook?: { totalSent?: number; status?: string } }
        | undefined
    )?.facebook;
    record({
      route: 'GET /api/dashboard/pixels/health',
      status: pixels.status,
      resolved:
        pixels.status === 200 &&
        facebook?.totalSent === 1 &&
        facebook.status === 'healthy',
      detail: JSON.stringify(facebook ?? pixelsBody.error),
    });

    const links = await getProfileSocialLinks(PROFILE_ID);
    record({
      route: 'action getProfileSocialLinks',
      status: 200,
      resolved: links.length === 1 && links[0]?.platform === 'spotify',
      detail: `${links.length} link(s)`,
    });

    const analytics = await getReleaseAnalytics(
      new Request(
        `http://127.0.0.1/api/dashboard/releases/${RELEASE_ID}/analytics`
      ),
      { params: Promise.resolve({ releaseId: RELEASE_ID }) }
    );
    const analyticsBody = await readJson(analytics);
    record({
      route: 'GET /api/dashboard/releases/[releaseId]/analytics',
      status: analytics.status,
      resolved: analytics.status === 200 && analyticsBody.totalClicks === 1,
      detail: JSON.stringify({
        totalClicks: analyticsBody.totalClicks,
        error: analyticsBody.error,
      }),
    });

    const feedback = await postFeedback(
      new Request('http://127.0.0.1/api/feedback', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          message: 'Null clerk id feedback ratchet',
          source: 'dashboard',
        }),
      })
    );
    const feedbackBody = await readJson(feedback);
    const storedFeedback = await rows<{ user_id: string | null }>(
      'SELECT user_id FROM feedback_items WHERE id = $1',
      [feedbackBody.id]
    );
    record({
      route: 'POST /api/feedback',
      status: feedback.status,
      resolved:
        feedback.status === 200 &&
        feedbackBody.ok === true &&
        storedFeedback[0]?.user_id === USER_ID,
      detail: `stored user ${storedFeedback[0]?.user_id ?? 'missing'}`,
    });

    const maxAccess = await postMax(
      new Request('http://127.0.0.1/api/max-access-request', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ reason: 'Need the null clerk id ratchet' }),
      })
    );
    const maxBody = await readJson(maxAccess);
    record({
      route: 'POST /api/max-access-request',
      status: maxAccess.status,
      resolved: maxAccess.status === 200 && maxBody.success === true,
      detail: String(maxBody.error ?? 'stored'),
    });

    await harness.client?.exec(
      `UPDATE users SET growth_access_requested_at = NULL, growth_access_reason = NULL WHERE id = '${USER_ID}'`
    );

    const growth = await postGrowth(
      new Request('http://127.0.0.1/api/growth-access-request', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ reason: 'Need the null clerk id ratchet' }),
      })
    );
    const growthBody = await readJson(growth);
    record({
      route: 'POST /api/growth-access-request',
      status: growth.status,
      resolved: growth.status === 200 && growthBody.success === true,
      detail: String(growthBody.error ?? 'stored'),
    });

    const sms = await postSms();
    const smsBody = await readJson(sms);
    record({
      route: 'POST /api/sms-access-request',
      status: sms.status,
      resolved: sms.status === 200 && smsBody.success === true,
      detail: String(smsBody.error ?? 'stored'),
    });

    const apple = await postApplePreSave(
      new Request('http://127.0.0.1/api/pre-save/apple', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          releaseId: RELEASE_ID,
          appleMusicUserToken: 'a'.repeat(24),
        }),
      })
    );
    const appleBody = await readJson(apple);
    record({
      route: 'POST /api/pre-save/apple',
      status: apple.status,
      resolved:
        apple.status === 404 &&
        appleBody.error === 'This release is not linked to Apple Music yet',
      detail: String(appleBody.error),
    });

    const state = encodeSpotifyPreSaveState({
      releaseId: RELEASE_ID,
      trackId: null,
      username: 'nullclerk',
      slug: 'ratchet-single',
    });
    const spotify = await getSpotifyCallback(
      new Request(
        `http://127.0.0.1/api/pre-save/spotify/callback?code=spotify-code&state=${encodeURIComponent(state)}`
      )
    );
    const storedPreSave = await rows<{ user_id: string | null }>(
      'SELECT user_id FROM pre_save_tokens WHERE spotify_account_id = $1',
      ['spotify-null-clerk']
    );
    record({
      route: 'GET /api/pre-save/spotify/callback',
      status: spotify.status,
      resolved: spotify.status === 302 && storedPreSave[0]?.user_id === USER_ID,
      detail: `stored user ${storedPreSave[0]?.user_id ?? 'missing'}`,
    });

    const db = harness.db;
    if (!db) throw new Error('Fixture database was not initialized');
    const beforeSignup = await rows<{ updated_at: string }>(
      'SELECT updated_at::text AS updated_at FROM users WHERE id = $1',
      [USER_ID]
    );
    const signup = await db.transaction(tx =>
      markWaitlistSignedUpInTx(tx, USER_ID)
    );
    const afterSignup = await rows<{ updated_at: string }>(
      'SELECT updated_at::text AS updated_at FROM users WHERE id = $1',
      [USER_ID]
    );
    record({
      route: 'waitlist signup markWaitlistSignedUpInTx',
      status: 200,
      resolved:
        signup.entryId === null &&
        beforeSignup[0]?.updated_at !== afterSignup[0]?.updated_at,
      detail: `entry ${signup.entryId ?? 'none'}, updated ${beforeSignup[0]?.updated_at} -> ${afterSignup[0]?.updated_at}`,
    });

    const token = 'null-clerk-invite-token';
    await harness.client?.exec(`
      INSERT INTO waitlist_entries (
        id, email, email_normalized, status, invite_token_hash, invite_token_expires_at
      ) VALUES (
        '${ENTRY_ID}', '${EMAIL}', '${EMAIL}', 'invited',
        '${hashWaitlistInviteToken(token)}', NOW() + INTERVAL '2 days'
      );
    `);
    const redeemed = await redeemWaitlistInviteToken({
      token,
      clerkUserId: USER_ID,
      verifiedEmail: EMAIL,
    });
    record({
      route: 'waitlist redeem redeemWaitlistInviteToken',
      status: redeemed.outcome === 'approved' ? 200 : 404,
      resolved: redeemed.outcome === 'approved' && redeemed.clerkId === USER_ID,
      detail: redeemed.outcome,
    });
    expect(
      await rows(
        'SELECT id, clerk_id, waitlist_entry_id FROM users WHERE email = $1',
        [EMAIL]
      )
    ).toEqual([{ id: USER_ID, clerk_id: null, waitlist_entry_id: ENTRY_ID }]);

    const replayed = await redeemWaitlistInviteToken({
      token,
      clerkUserId: USER_ID,
      verifiedEmail: EMAIL,
    });
    record({
      route: 'waitlist redeem replay for the same user',
      status: replayed.outcome === 'approved' ? 200 : 404,
      resolved:
        replayed.outcome === 'approved' &&
        replayed.entryId === ENTRY_ID &&
        replayed.clerkId === USER_ID,
      detail: replayed.outcome,
    });

    const failed = probes.filter(probe => !probe.resolved);
    expect(failed, JSON.stringify(probes, null, 2)).toEqual([]);
    expect(probes.every(probe => probe.resolved)).toBe(true);
  }, 60_000);
});
