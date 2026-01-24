import { clerkSetup } from '@clerk/testing/playwright';
import { chromium } from '@playwright/test';
import { config } from 'dotenv';
import { seedTestData } from './seed-test-data';

// Load environment variables from .env.development.local
config({ path: '.env.development.local' });

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

  // ALWAYS set up Clerk testing token if we have real Clerk keys
  // This must happen before any early returns, as setupClerkTestingToken()
  // in individual tests requires clerkSetup() to have been called
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
      // Signal to tests that clerkSetup succeeded
      process.env.CLERK_TESTING_SETUP_SUCCESS = 'true';
      console.log('✓ Clerk testing token set up successfully');
    } catch (error) {
      console.warn('⚠ Failed to set up Clerk testing token');
      // Only log error details in development, not the actual error which may contain sensitive info
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
    // Helpful default for links and sitemap-related logic
    NEXT_PUBLIC_APP_URL:
      process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3100',
  });

  // Seed test database with required profiles for smoke tests
  // Only seed if DATABASE_URL is available and not in CI with external BASE_URL
  if (process.env.DATABASE_URL && !(isCI && process.env.BASE_URL)) {
    try {
      console.log('🌱 Seeding test data...');
      await seedTestData();
      console.log('✓ Test data seeded successfully');
    } catch (error) {
      console.warn('⚠ Failed to seed test data:', error);
      console.log('  Tests may fail if required profiles are missing');
      // In CI, treat seeding failures as fatal for smoke tests
      if (isCI && isSmokeOnly) {
        console.error('❌ Seeding is required for smoke tests in CI');
        throw error;
      }
    }
  } else if (!process.env.DATABASE_URL) {
    console.log('ℹ DATABASE_URL not set, skipping test data seeding');
  }

  // OPTIMIZATION: Skip browser warmup for smoke tests
  if (isSmokeOnly) {
    const elapsed = Date.now() - startTime;
    console.log(
      `⚡ Smoke test setup complete in ${elapsed}ms (skipping warmup)`
    );
    return;
  }

  // Start browser to warm up (non-smoke only)
  console.log('🌐 Warming up browser...');
  const browser = await chromium.launch();
  const page = await browser.newPage();

  // Navigate to the app to ensure it's ready
  const baseURL = process.env.BASE_URL || 'http://localhost:3100';
  try {
    await page.goto(baseURL, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForLoadState('domcontentloaded', { timeout: 10000 });
    console.log('✓ Browser warmup complete');
  } catch (error) {
    console.warn('⚠ Browser warmup failed (non-fatal):', error);
  } finally {
    await browser.close();
  }

  const elapsed = Date.now() - startTime;
  console.log(`✅ E2E global setup complete in ${elapsed}ms`);
}

export default globalSetup;
