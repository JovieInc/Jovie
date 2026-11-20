// @vitest-environment node
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { emailOTP } from 'better-auth/plugins/email-otp';
import { drizzle } from 'drizzle-orm/pglite';
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';

const holder = vi.hoisted(() => ({ db: null as unknown }));
vi.mock('server-only', () => ({}));
vi.mock('@/lib/db', () => ({
  get db() {
    return holder.db;
  },
}));

vi.mock('@/lib/auth/proxy-state', () => ({
  invalidateProxyUserStateCache: vi.fn().mockResolvedValue(undefined),
}));
// Replace only the application's RLS-session wrapper with the same real
// PostgreSQL serializable transaction boundary. Redemption queries, row locks,
// status changes, audit writes and bounded serializable retry stay real.
vi.mock('@/lib/ingestion/session', () => ({
  withSystemIngestionSession: <T>(operation: (tx: unknown) => Promise<T>) =>
    (holder.db as ReturnType<typeof drizzle>).transaction(operation, {
      isolationLevel: 'serializable',
    }),
}));

import {
  baAccounts,
  baSessions,
  baUsers,
  baVerifications,
} from '@/lib/db/schema/better-auth';
import {
  newProdcertUserEmail,
  PRODCERT_RETURNING_CANARY_EMAIL,
} from '@/lib/synthetic/prodcert-identities';
import { redeemWaitlistInviteToken } from '@/lib/waitlist/redeem';
import { hashWaitlistInviteToken } from '@/lib/waitlist/tokens';
import { assertNewAccountAdmission } from './signup-admission';

let client: PGlite;
let database: ReturnType<typeof drizzle>;

// Real PostgreSQL constraints and production migrations, with only email delivery
// and the external identity provider replaced. No production DB or credentials.
beforeAll(async () => {
  client = new PGlite();
  const dir = path.join(process.cwd(), 'drizzle', 'migrations');
  const journal = JSON.parse(
    readFileSync(path.join(dir, 'meta', '_journal.json'), 'utf8')
  ) as { entries: { tag: string }[] };
  for (const { tag } of journal.entries) {
    await client.exec(
      readFileSync(path.join(dir, `${tag}.sql`), 'utf8').replaceAll(
        '--> statement-breakpoint',
        ''
      )
    );
  }
  database = drizzle(client);
  holder.db = database;
}, 120_000);

afterAll(async () => client?.close());

beforeEach(async () => {
  await client.exec(
    'TRUNCATE ba_sessions, ba_accounts, ba_verifications, ba_users, waitlist_entries, users CASCADE'
  );
});

function createAuth() {
  const codes = new Map<string, string>();
  const provider = { email: 'invited@example.com', emailVerified: true };
  const auth = betterAuth({
    baseURL: 'http://localhost:3100',
    secret: 'local-admission-regression-secret-at-least-thirty-two-characters',
    database: drizzleAdapter(database, {
      provider: 'pg',
      transaction: false,
      schema: {
        user: baUsers,
        session: baSessions,
        account: baAccounts,
        verification: baVerifications,
      },
    }),
    advanced: { useSecureCookies: false },
    rateLimit: { enabled: false },
    databaseHooks: { user: { create: { before: assertNewAccountAdmission } } },
    socialProviders: {
      google: {
        clientId: 'local-provider-fixture',
        clientSecret: 'local-provider-fixture',
        verifyIdToken: async () => true,
        getUserInfo: async () => ({
          user: {
            name: 'Invited user',
            ...provider,
          },
          data: {
            aud: 'local-provider-fixture',
            azp: 'local-provider-fixture',
            email: provider.email,
            email_verified: provider.emailVerified,
            exp: Math.floor(Date.now() / 1000) + 3600,
            family_name: 'User',
            given_name: 'Invited',
            iat: Math.floor(Date.now() / 1000),
            iss: 'https://accounts.google.com',
            name: 'Invited user',
            picture: 'https://example.com/avatar.png',
            sub: `provider-${provider.email}`,
          },
        }),
      },
    },
    plugins: [
      emailOTP({
        async sendVerificationOTP({ email, otp }) {
          codes.set(email, otp);
        },
      }),
    ],
  });
  return { auth, codes, provider };
}

type InviteOptions = {
  status?: string;
  canonical?: boolean;
  expiresAt?: Date | null;
  redeemedAt?: Date | null;
  tokenHash?: string | null;
};

async function invite(
  email = 'invited@example.com',
  options: InviteOptions = {}
) {
  await client.query(
    `INSERT INTO waitlist_entries
      (email, email_normalized, canonical, status, invite_token_hash,
       invite_token_expires_at, invite_token_redeemed_at)
     VALUES ($1, $1, $2, $3, $4, $5, $6)`,
    [
      email,
      options.canonical ?? true,
      options.status ?? 'invited',
      options.tokenHash === undefined
        ? 'issued-invite-hash'
        : options.tokenHash,
      options.expiresAt === undefined
        ? new Date(Date.now() + 60_000)
        : options.expiresAt,
      options.redeemedAt ?? null,
    ]
  );
}

async function counts() {
  const result = await client.query<{
    users: number;
    sessions: number;
    accounts: number;
  }>(`SELECT (SELECT count(*)::int FROM ba_users) AS users,
      (SELECT count(*)::int FROM ba_sessions) AS sessions,
      (SELECT count(*)::int FROM ba_accounts) AS accounts`);
  return result.rows[0];
}

async function requestCode(
  fixture: ReturnType<typeof createAuth>,
  email: string
) {
  await fixture.auth.api.sendVerificationOTP({
    body: { email, type: 'sign-in' },
  });
  const otp = fixture.codes.get(email.toLowerCase());
  expect(otp).toMatch(/^\d{6}$/);
  return otp!;
}

async function otpSignIn(
  fixture: ReturnType<typeof createAuth>,
  email = 'invited@example.com'
) {
  const otp = await requestCode(fixture, email);
  return fixture.auth.api.signInEmailOTP({
    body: { email, otp },
    asResponse: true,
  });
}

function socialSignIn(fixture: ReturnType<typeof createAuth>) {
  return fixture.auth.api.signInSocial({
    body: {
      provider: 'google',
      idToken: { token: 'external-provider-fixture' },
    },
    asResponse: true,
  });
}

describe('new-account admission through Better Auth', () => {
  it('rejects a valid public OTP before any user or session is persisted', async () => {
    const response = await otpSignIn(createAuth(), 'public@example.com');
    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({
      code: 'SIGNUP_INVITE_REQUIRED',
    });
    expect(await counts()).toEqual({ users: 0, sessions: 0, accounts: 0 });
  });

  it.each(['invited', 'approved'])(
    'admits a verified recipient of an active %s invitation without redeeming it',
    async status => {
      await invite('invited@example.com', { status });
      const response = await otpSignIn(createAuth(), 'INVITED@example.com');
      expect(response.ok).toBe(true);
      expect(await counts()).toMatchObject({ users: 1, sessions: 1 });
      const { rows } = await client.query<{ redeemed: Date | null }>(
        'SELECT invite_token_redeemed_at AS redeemed FROM waitlist_entries'
      );
      expect(rows[0]?.redeemed).toBeNull();
    }
  );

  it.each([
    ['pending', { status: 'waitlisted' }],
    ['blocked', { status: 'blocked' }],
    ['rejected', { status: 'rejected' }],
    ['expired state', { status: 'expired' }],
    ['claimed', { status: 'claimed' }],
    ['signed up', { status: 'signed_up' }],
    ['expired token', { expiresAt: new Date(0) }],
    ['missing expiry', { expiresAt: null }],
    ['redeemed token', { redeemedAt: new Date() }],
    ['missing token', { tokenHash: null }],
    ['empty token', { tokenHash: '' }],
    ['noncanonical duplicate', { canonical: false }],
  ] satisfies [string, InviteOptions][])(
    'rejects a valid OTP with %s authority',
    async (_label, options) => {
      await invite('invited@example.com', options);
      const response = await otpSignIn(createAuth());
      expect(response.status).toBe(403);
      expect(await counts()).toEqual({ users: 0, sessions: 0, accounts: 0 });
    }
  );

  it('does not admit a different verified email from an invitation', async () => {
    await invite();
    const response = await otpSignIn(createAuth(), 'different@example.com');
    expect(response.status).toBe(403);
    expect(await counts()).toEqual({ users: 0, sessions: 0, accounts: 0 });
  });

  it('does not let a stale duplicate override the canonical revoked entry', async () => {
    await invite('invited@example.com', { canonical: false });
    await invite('invited@example.com', { status: 'blocked' });
    expect((await otpSignIn(createAuth())).status).toBe(403);
    expect(await counts()).toEqual({ users: 0, sessions: 0, accounts: 0 });
  });

  it('keeps existing-user OTP sign-in working after invitation revocation', async () => {
    await invite();
    const fixture = createAuth();
    expect((await otpSignIn(fixture)).ok).toBe(true);
    await client.exec("UPDATE waitlist_entries SET status = 'blocked'");
    expect((await otpSignIn(fixture)).ok).toBe(true);
    expect(await counts()).toMatchObject({ users: 1, sessions: 2 });
  });

  it.each([
    'waitlist_approved',
    'profile_claimed',
    'onboarding_incomplete',
    'active',
  ])(
    'preserves verified migration of an existing %s app account',
    async status => {
      await client.query(
        'INSERT INTO users (email, user_status) VALUES ($1, $2)',
        ['Legacy@Example.com', status]
      );
      expect((await otpSignIn(createAuth(), 'legacy@example.com')).ok).toBe(
        true
      );
      expect(await counts()).toMatchObject({ users: 1, sessions: 1 });
    }
  );

  it.each([
    ['pending', 'waitlist_pending', null, null],
    ['deleted', 'active', new Date(), null],
    ['already linked', 'active', null, 'different-auth-identity'],
  ])(
    'does not admit an existing %s app row as migration authority',
    async (_label, status, deletedAt, authId) => {
      await client.query(
        'INSERT INTO users (email, user_status, deleted_at, better_auth_user_id) VALUES ($1, $2, $3, $4)',
        ['legacy@example.com', status, deletedAt, authId]
      );
      expect((await otpSignIn(createAuth(), 'legacy@example.com')).status).toBe(
        403
      );
      expect(await counts()).toEqual({ users: 0, sessions: 0, accounts: 0 });
    }
  );

  it('rejects public OAuth before creating a user, account or session', async () => {
    const response = await socialSignIn(createAuth());
    expect(response.ok).toBe(false);
    expect(await counts()).toEqual({ users: 0, sessions: 0, accounts: 0 });
  });

  it('admits an invited OAuth recipient only when the provider verified the email', async () => {
    await invite();
    const fixture = createAuth();
    fixture.provider.emailVerified = false;
    expect((await socialSignIn(fixture)).ok).toBe(false);
    expect(await counts()).toEqual({ users: 0, sessions: 0, accounts: 0 });
    fixture.provider.emailVerified = true;
    expect((await socialSignIn(fixture)).ok).toBe(true);
    expect(await counts()).toEqual({ users: 1, sessions: 1, accounts: 1 });
    await client.exec("UPDATE waitlist_entries SET status = 'blocked'");
    expect((await socialSignIn(fixture)).ok).toBe(true);
    expect(await counts()).toEqual({ users: 1, sessions: 2, accounts: 1 });
  });

  it.each([
    PRODCERT_RETURNING_CANARY_EMAIL,
    newProdcertUserEmail('admission20261102'),
  ])('preserves the existing verified canary path %s', async email => {
    const response = await otpSignIn(createAuth(), email);
    expect(response.ok).toBe(true);
    expect(await counts()).toMatchObject({ users: 1, sessions: 1 });
  });

  it('does not admit an unverified canary or a lookalike recipient', async () => {
    await expect(
      assertNewAccountAdmission({
        email: PRODCERT_RETURNING_CANARY_EMAIL,
        emailVerified: false,
      })
    ).rejects.toMatchObject({ statusCode: 403 });
    expect(
      (
        await otpSignIn(
          createAuth(),
          'browse-ready+synthetic-prodcert-valid123@evil.test'
        )
      ).status
    ).toBe(403);
    expect(await counts()).toEqual({ users: 0, sessions: 0, accounts: 0 });
  });

  it('never creates an identity for simultaneous rejected invitation attempts', async () => {
    await invite('invited@example.com', { status: 'blocked' });
    const responses = await Promise.all([
      otpSignIn(createAuth()),
      socialSignIn(createAuth()),
    ]);
    expect(responses.every(response => !response.ok)).toBe(true);
    expect(await counts()).toEqual({ users: 0, sessions: 0, accounts: 0 });
  });

  it('keeps concurrent verified OTP and OAuth creation bound to one identity', async () => {
    await invite();
    const fixture = createAuth();
    const responses = await Promise.all([
      otpSignIn(fixture),
      socialSignIn(fixture),
    ]);
    expect(responses.some(response => response.ok)).toBe(true);
    const stored = await counts();
    expect(stored?.users).toBe(1);
    expect(stored?.accounts).toBeLessThanOrEqual(1);
    expect(stored?.sessions).toBeGreaterThanOrEqual(1);
    const orphans = await client.query<{ count: number }>(
      `SELECT count(*)::int AS count FROM ba_sessions s
       LEFT JOIN ba_users u ON u.id = s.user_id WHERE u.id IS NULL`
    );
    expect(orphans.rows[0]?.count).toBe(0);
  });

  it('fails closed when the durable invitation read fails', async () => {
    const fixture = createAuth();
    const otp = await requestCode(fixture, 'invited@example.com');
    await client.exec(
      'ALTER TABLE waitlist_entries RENAME TO unavailable_waitlist_entries'
    );
    try {
      await expect(
        fixture.auth.api.signInEmailOTP({
          body: { email: 'invited@example.com', otp },
          asResponse: true,
        })
      ).rejects.toThrow();
      expect(await counts()).toEqual({ users: 0, sessions: 0, accounts: 0 });
    } finally {
      await client.exec(
        'ALTER TABLE unavailable_waitlist_entries RENAME TO waitlist_entries'
      );
    }
  });
});

const INVITE_TOKEN = 'local-issued-invitation-for-redemption-regression';
const APP_USER_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const redeem = (token = INVITE_TOKEN, email = 'invited@example.com') =>
  redeemWaitlistInviteToken({
    token,
    clerkUserId: APP_USER_ID,
    verifiedEmails: [email],
  });

describe('issued invitation redemption against PostgreSQL', () => {
  it('refuses an active noncanonical token even for its verified recipient', async () => {
    await invite('invited@example.com', {
      canonical: false,
      tokenHash: hashWaitlistInviteToken(INVITE_TOKEN),
    });
    expect(await redeem()).toEqual({ outcome: 'invalid' });
    expect((await client.query('SELECT id FROM users')).rows).toHaveLength(0);
  });

  it('refuses concurrent invalid, expired and mismatched invitation attempts', async () => {
    await invite('invited@example.com', {
      tokenHash: hashWaitlistInviteToken(INVITE_TOKEN),
      expiresAt: new Date(0),
    });
    const results = await Promise.all([
      redeem('different-token'),
      redeem(),
      redeem(INVITE_TOKEN, 'different@example.com'),
    ]);
    expect(results.map(result => result.outcome)).toEqual([
      'invalid',
      'expired',
      'email_mismatch',
    ]);
    expect((await client.query('SELECT id FROM users')).rows).toHaveLength(0);
  });

  it('keeps same-user concurrent redemption idempotent with one audit write', async () => {
    await invite('invited@example.com', {
      tokenHash: hashWaitlistInviteToken(INVITE_TOKEN),
    });
    const results = await Promise.all([redeem(), redeem()]);
    expect(results.map(result => result.outcome)).toEqual([
      'approved',
      'approved',
    ]);
    expect((await client.query('SELECT id FROM users')).rows).toHaveLength(1);
    expect(
      (await client.query('SELECT id FROM waitlist_audit_logs')).rows
    ).toHaveLength(1);
  });

  it('rejects a revoked invitation at redemption even after admission succeeded', async () => {
    await invite('invited@example.com', {
      tokenHash: hashWaitlistInviteToken(INVITE_TOKEN),
    });
    await assertNewAccountAdmission({
      email: 'invited@example.com',
      emailVerified: true,
    });
    await client.exec("UPDATE waitlist_entries SET status = 'blocked'");
    expect(await redeem()).toEqual({ outcome: 'invalid' });
    expect((await client.query('SELECT id FROM users')).rows).toHaveLength(0);
  });
});
