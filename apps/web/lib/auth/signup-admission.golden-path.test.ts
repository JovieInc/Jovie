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
import { issueGoldenPathInvitation } from '@/lib/testing/golden-path-invitation-fixture';
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

describe('Golden Path issued invitation fixture', () => {
  const environment = { E2E_TEST_MODE: '1', VERCEL_ENV: 'development' };
  const query = async (text: string, params: unknown[]) =>
    (await client.query<{ id: string }>(text, params)).rows;

  it('admits its first real OTP only after the invitation is persisted', async () => {
    const email = 'gp-admitted+e2e@test.jovie.com';
    const fixture = createAuth();
    const denied = await otpSignIn(fixture, email);
    expect(denied.status).toBe(403);
    expect(await denied.json()).toMatchObject({
      code: 'SIGNUP_INVITE_REQUIRED',
    });
    expect(await counts()).toEqual({ users: 0, sessions: 0, accounts: 0 });

    const entryId = await issueGoldenPathInvitation(query, email, environment);
    const admitted = await otpSignIn(fixture, email);
    expect(admitted.status).toBe(200);
    expect(await counts()).toMatchObject({ users: 1, sessions: 1 });
    const { rows } = await client.query<{ id: string; redeemed: Date | null }>(
      'SELECT id, invite_token_redeemed_at AS redeemed FROM waitlist_entries'
    );
    expect(rows).toEqual([{ id: entryId, redeemed: null }]);
  });

  it.each([
    { E2E_TEST_MODE: '1', VERCEL_ENV: 'production' },
    { E2E_TEST_MODE: '0', VERCEL_ENV: 'development' },
  ])(
    'refuses invitation fixture writes outside the isolated lane',
    async env => {
      await expect(
        issueGoldenPathInvitation(query, 'gp-admitted+e2e@test.jovie.com', env)
      ).rejects.toThrow('isolated test identity');
      expect(
        (await client.query('SELECT id FROM waitlist_entries')).rows
      ).toEqual([]);
    }
  );

  it('refuses non-fixture recipients before creating an invitation', async () => {
    await expect(
      issueGoldenPathInvitation(query, 'customer@example.com', environment)
    ).rejects.toThrow('isolated test identity');
    expect(
      (await client.query('SELECT id FROM waitlist_entries')).rows
    ).toEqual([]);
  });
});
