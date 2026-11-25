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
  afterEach,
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

import {
  baAccounts,
  baSessions,
  baUsers,
  baVerifications,
} from '@/lib/db/schema/better-auth';
import { CODE_FLAGS } from '@/lib/flags/code-flags';
import { assertNewAccountAdmission } from './signup-admission';

let client: PGlite;
let database: ReturnType<typeof drizzle>;

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

afterAll(async () => {
  vi.unstubAllEnvs();
  await client?.close();
});

beforeEach(async () => {
  vi.unstubAllEnvs();
  delete process.env.FEATURE_PUBLIC_SIGNUP_CLOSED;
  await client.exec(
    'TRUNCATE ba_sessions, ba_accounts, ba_verifications, ba_users, waitlist_entries, users CASCADE'
  );
});

afterEach(() => {
  vi.unstubAllEnvs();
});

function createAuth() {
  const codes = new Map<string, string>();
  const provider = { email: 'organic-artist@example.com', emailVerified: true };
  const auth = betterAuth({
    baseURL: 'http://localhost:3100',
    secret: 'local-open-signup-regression-secret-at-least-thirty-two-chars',
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
          user: { name: 'Organic Artist', ...provider },
          data: {
            aud: 'local-provider-fixture',
            azp: 'local-provider-fixture',
            email: provider.email,
            email_verified: provider.emailVerified,
            exp: Math.floor(Date.now() / 1000) + 3600,
            family_name: 'Artist',
            given_name: 'Organic',
            iat: Math.floor(Date.now() / 1000),
            iss: 'https://accounts.google.com',
            name: 'Organic Artist',
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

async function otpSignIn(
  fixture: ReturnType<typeof createAuth>,
  email: string
) {
  await fixture.auth.api.sendVerificationOTP({
    body: { email, type: 'sign-in' },
  });
  const otp = fixture.codes.get(email.toLowerCase());
  expect(otp).toMatch(/^\d{6}$/);
  return fixture.auth.api.signInEmailOTP({
    body: { email, otp: otp! },
    asResponse: true,
  });
}

describe('open public signup vs FEATURE_PUBLIC_SIGNUP_CLOSED kill switch', () => {
  it('admits an uninvited verified OTP user when PUBLIC_SIGNUP_CLOSED defaults to false', async () => {
    expect(CODE_FLAGS.PUBLIC_SIGNUP_CLOSED).toBe(false);
    const response = await otpSignIn(createAuth(), 'public-artist@example.com');
    expect(response.status).toBe(200);
    expect(await counts()).toMatchObject({ users: 1, sessions: 1 });
  });

  it('admits a verified OAuth user when public signup is open and rejects unverified OAuth', async () => {
    const fixture = createAuth();
    fixture.provider.emailVerified = false;
    const rejected = await fixture.auth.api.signInSocial({
      body: { provider: 'google', idToken: { token: 'fixture' } },
      asResponse: true,
    });
    expect(rejected.ok).toBe(false);
    expect(await counts()).toEqual({ users: 0, sessions: 0, accounts: 0 });

    fixture.provider.emailVerified = true;
    const admitted = await fixture.auth.api.signInSocial({
      body: { provider: 'google', idToken: { token: 'fixture' } },
      asResponse: true,
    });
    expect(admitted.ok).toBe(true);
    expect(await counts()).toEqual({ users: 1, sessions: 1, accounts: 1 });
  });

  it('restores SIGNUP_INVITE_REQUIRED immediately when FEATURE_PUBLIC_SIGNUP_CLOSED=true', async () => {
    vi.stubEnv('FEATURE_PUBLIC_SIGNUP_CLOSED', 'true');
    const response = await otpSignIn(createAuth(), 'public-artist@example.com');
    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({
      code: 'SIGNUP_INVITE_REQUIRED',
    });
    expect(await counts()).toEqual({ users: 0, sessions: 0, accounts: 0 });
  });
});
