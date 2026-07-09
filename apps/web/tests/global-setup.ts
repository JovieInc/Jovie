import { config } from 'dotenv';
import path from 'path';
import { APP_ROUTES } from '../constants/routes';
import { TEST_AUTH_BYPASS_MODE, TEST_MODE_HEADER } from '../lib/auth/test-mode';
import { resolveWebServerWarmupProfile } from './e2e/utils/warmup-profile';
import {
  ensureDevTestAuthPersona,
  resolveDevTestAuthPersona,
} from './helpers/dev-test-auth-personas';
import { seedTestData } from './seed-test-data';

// Load environment variables in priority order (first-loaded wins with override: false)
const webRoot = path.resolve(__dirname, '..');
const repoRoot = path.resolve(webRoot, '../..');

config({ path: path.join(webRoot, '.env.development.local') }); // E2E creds
config({ path: path.join(repoRoot, '.env.local') }); // Real Clerk keys
config({ path: path.join(repoRoot, '.env.test') }); // Fallback defaults

const isCI = !!process.env.CI;
const isSmokeOnly = process.env.SMOKE_ONLY === '1';
const webServerWarmupProfile = resolveWebServerWarmupProfile({ isCI });

async function globalSetup() {
  const startTime = Date.now();
  console.log('🚀 Starting E2E global setup...');

  // Diagnostic: show which env files loaded
  console.log('  Env files loaded:');
  console.log(
    `    .env.development.local: ${process.env.E2E_CLERK_USER_USERNAME ? 'yes (has E2E creds)' : 'no creds found'}`
  );
  console.log(
    `    .env.local: ${process.env.CLERK_SECRET_KEY ? 'yes (has Clerk keys)' : 'no Clerk keys found'}`
  );

  // Set up Clerk testing token if we have real Clerk keys
  // Clerk → Better Auth migration: Clerk key checks removed.
  // The test user check is retained for the bypass persona seeding path.
  const testUsername = process.env.E2E_CLERK_USER_USERNAME ?? '';
  const hasTestUser =
    testUsername.length > 0 &&
    (testUsername.includes('+clerk_test') ||
      !!process.env.E2E_CLERK_USER_PASSWORD);

  // Clerk → Better Auth migration, commit ⑩: `clerkSetup` is removed.
  // Under BA the dev bypass route mints a real session cookie — no Clerk
  // testing token is needed. Signal success so specs that check
  // `CLERK_TESTING_SETUP_SUCCESS` still pass.
  process.env.CLERK_TESTING_SETUP_SUCCESS = 'true';
  console.log('✓ Better Auth dev bypass ready (no Clerk setup needed)');

  if (hasTestUser) {
    console.log('✓ E2E test user is configured');
  }

  // When running against an external BASE_URL in CI (e.g., Preview),
  // skip local env overrides, seeding, and warmup (clerkSetup already done above)
  if (isCI && process.env.BASE_URL) {
    console.log(`ℹ CI mode with external BASE_URL: ${process.env.BASE_URL}`);
    console.log('  Skipping local env overrides and warmup');
    return;
  }

  // Set up environment variables for local testing defaults (do not override if already set)
  Object.assign(process.env, {
    NODE_ENV: process.env.NODE_ENV || 'test',
    NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY:
      process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY ||
      'pk_test_mock-key-for-testing',
    NEXT_PUBLIC_CLERK_PRICING_TABLE_ID:
      process.env.NEXT_PUBLIC_CLERK_PRICING_TABLE_ID || 'prctbl_dummy',
    CLERK_SECRET_KEY:
      process.env.CLERK_SECRET_KEY || 'sk_test_mock-key-for-testing',
    E2E_CLERK_USER_USERNAME: process.env.E2E_CLERK_USER_USERNAME || '',
    E2E_CLERK_USER_PASSWORD: process.env.E2E_CLERK_USER_PASSWORD || '',
    NEXT_PUBLIC_APP_URL:
      process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3100',
  });

  // Seed test database with required profiles for smoke tests
  if (process.env.E2E_SKIP_SEED === '1') {
    console.log('ℹ E2E_SKIP_SEED=1, skipping test data seeding');
  } else if (process.env.DATABASE_URL) {
    try {
      console.log('🌱 Seeding test data...');
      await seedTestData();
      console.log('✓ Test data seeded successfully');
    } catch (error) {
      console.warn('⚠ Failed to seed test data:', error);
      console.log('  Tests may fail if required profiles are missing');
      if (isCI && isSmokeOnly) {
        console.error('❌ Seeding is required for smoke tests in CI');
        throw error;
      }
    }
  } else {
    console.log('ℹ DATABASE_URL not set, skipping test data seeding');
  }

  if (process.env.E2E_USE_TEST_AUTH_BYPASS === '1') {
    const persona =
      resolveDevTestAuthPersona(process.env.E2E_TEST_AUTH_PERSONA) ??
      'creator-ready';

    if (process.env.DATABASE_URL) {
      try {
        const actor = await ensureDevTestAuthPersona(persona);
        console.log(
          `✓ Dev test auth persona provisioned (${persona}: ${actor.clerkUserId})`
        );
      } catch (error) {
        console.warn('⚠ Failed to provision dev test auth persona:', error);
        if (isCI && isSmokeOnly) {
          throw error;
        }
      }
    } else {
      console.log('ℹ DATABASE_URL not set, skipping dev auth persona seed');
    }
  }

  if (process.env.E2E_SKIP_WARMUP === '1') {
    console.log('ℹ E2E_SKIP_WARMUP=1, skipping Turbopack route warmup');
    console.log(`✅ E2E global setup complete in ${Date.now() - startTime}ms`);
    return;
  }

  console.log(`🔥 Warming up routes for ${webServerWarmupProfile} profile...`);
  const baseURL = process.env.BASE_URL || 'http://localhost:3100';
  const testProfile = process.env.E2E_TEST_PROFILE || 'dualipa';
  const warmupRoutes =
    webServerWarmupProfile === 'public'
      ? ['/']
      : [
          '/',
          '/signin',
          '/api/handle/check?handle=e2e-warmup-handle',
          '/api/dashboard/profile',
          '/api/stripe/checkout',
          '/api/stripe/pricing-options',
          APP_ROUTES.CHAT, // auth.setup.ts navigates here — avoid first-visit 404
          APP_ROUTES.LIBRARY,
          APP_ROUTES.RELEASES,
          APP_ROUTES.TASKS,
          APP_ROUTES.AUDIENCE,
          APP_ROUTES.PRESENCE,
          APP_ROUTES.EARNINGS,
          APP_ROUTES.DASHBOARD_PROFILE,
          `/${testProfile}`,
          `/${testProfile}?mode=listen`,
          `/${testProfile}?mode=tip`,
          APP_ROUTES.ADMIN,
          APP_ROUTES.ADMIN_CREATORS,
          APP_ROUTES.ADMIN_USERS,
        ];
  for (const route of warmupRoutes) {
    try {
      const res = await fetch(`${baseURL}${route}`, {
        signal: AbortSignal.timeout(120_000),
        redirect: 'follow',
      });
      console.log(`  ✓ ${route} (${res.status}) warmed up`);
    } catch {
      console.log(
        `  ⚠ ${route} warmup failed (will compile on first test visit)`
      );
    }
  }

  const apiWarmupRequests =
    webServerWarmupProfile === 'public'
      ? []
      : [
          ...(process.env.E2E_USE_TEST_AUTH_BYPASS === '1'
            ? [
                {
                  body: JSON.stringify({
                    persona:
                      resolveDevTestAuthPersona(
                        process.env.E2E_TEST_AUTH_PERSONA
                      ) ?? 'creator-ready',
                  }),
                  headers: {
                    'Content-Type': 'application/json',
                    [TEST_MODE_HEADER]: TEST_AUTH_BYPASS_MODE,
                  },
                  method: 'POST',
                  route: '/api/dev/test-auth/session',
                },
              ]
            : []),
          {
            body: JSON.stringify({}),
            headers: { 'Content-Type': 'application/json' },
            method: 'POST',
            route: '/api/onboarding/welcome-chat',
          },
        ];

  for (const request of apiWarmupRequests) {
    try {
      const res = await fetch(`${baseURL}${request.route}`, {
        body: request.body,
        headers: request.headers,
        method: request.method,
        signal: AbortSignal.timeout(120_000),
        redirect: 'follow',
      });
      console.log(`  ✓ ${request.route} (${res.status}) warmed up`);
    } catch {
      console.log(
        `  ⚠ ${request.route} warmup failed (will compile on first test visit)`
      );
    }
  }

  const elapsed = Date.now() - startTime;
  console.log(`✅ E2E global setup complete in ${elapsed}ms`);
}

export default globalSetup;
