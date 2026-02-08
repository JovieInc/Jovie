import { clerkSetup } from '@clerk/testing/playwright';
import { config } from 'dotenv';
import path from 'path';
import { seedTestData } from './seed-test-data';

// Load environment variables in priority order (first-loaded wins with override: false)
const webRoot = path.resolve(__dirname, '..');
const repoRoot = path.resolve(webRoot, '../..');

config({ path: path.join(webRoot, '.env.development.local') }); // E2E creds
config({ path: path.join(repoRoot, '.env.local') }); // Real Clerk keys
config({ path: path.join(repoRoot, '.env.test') }); // Fallback defaults

const isCI = !!process.env.CI;
const isSmokeOnly = process.env.SMOKE_ONLY === '1';

const SENSITIVE_PATTERNS = [
  'dummy',
  'mock',
  '1234567890',
  'test-key',
  'placeholder',
];

function isRealKey(key: string | undefined): key is string {
  if (!key) return false;
  const lowerKey = key.toLowerCase();
  return !SENSITIVE_PATTERNS.some(pattern => lowerKey.includes(pattern));
}

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
  const secretKey = process.env.CLERK_SECRET_KEY;
  const publishableKey =
    process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY ??
    process.env.CLERK_PUBLISHABLE_KEY;
  const hasRealClerkKeys = isRealKey(secretKey) && isRealKey(publishableKey);

  const hasTestUser =
    process.env.E2E_CLERK_USER_USERNAME && process.env.E2E_CLERK_USER_PASSWORD;

  if (hasRealClerkKeys) {
    try {
      await clerkSetup({
        publishableKey: publishableKey!,
        secretKey: secretKey!,
      });
      // Signal to tests and auth.setup.ts that clerkSetup succeeded
      process.env.CLERK_TESTING_SETUP_SUCCESS = 'true';
      console.log('✓ Clerk testing token set up successfully');
    } catch (error) {
      console.warn('⚠ Failed to set up Clerk testing token');
      if (process.env.NODE_ENV === 'development') {
        console.warn(
          'Error details:',
          error instanceof Error ? error.message : String(error)
        );
      }
      console.log('  Tests will run without Clerk authentication');
    }
  } else {
    console.log('ℹ Using mock Clerk keys for testing');
  }

  if (hasTestUser) {
    console.log('✓ E2E test user is configured');
  } else if (hasRealClerkKeys) {
    console.log('⚠ Clerk keys found but no test user configured');
    console.log(
      '  Set E2E_CLERK_USER_USERNAME and E2E_CLERK_USER_PASSWORD for authenticated tests'
    );
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
  if (process.env.DATABASE_URL) {
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

  const elapsed = Date.now() - startTime;
  console.log(`✅ E2E global setup complete in ${elapsed}ms`);
}

export default globalSetup;
