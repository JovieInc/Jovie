import { clerkSetup } from '@clerk/testing/playwright';
import { chromium } from '@playwright/test';
import { config } from 'dotenv';

// Load environment variables from .env.development.local
config({ path: '.env.development.local' });

async function globalSetup() {
  // When running against an external BASE_URL in CI (e.g., Preview), skip local env overrides and warmup.
  if (process.env.CI && process.env.BASE_URL) {
    return;
  }

  // Set up Clerk testing token if we have real Clerk keys and test user credentials
  const SENSITIVE_PATTERNS = [
    'dummy',
    'mock',
    '1234567890',
    'test-key',
    'placeholder',
  ];
  const hasRealClerkKeys =
    process.env.CLERK_SECRET_KEY &&
    !SENSITIVE_PATTERNS.some(pattern =>
      process.env.CLERK_SECRET_KEY!.toLowerCase().includes(pattern)
    );

  const hasTestUser =
    process.env.E2E_CLERK_USER_USERNAME && process.env.E2E_CLERK_USER_PASSWORD;

  if (hasRealClerkKeys && hasTestUser) {
    try {
      await clerkSetup({
        publishableKey: process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY!,
        secretKey: process.env.CLERK_SECRET_KEY!,
      });
      console.log('✓ Clerk testing token set up successfully');
      console.log('✓ E2E test user is configured');
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
  } else if (!hasRealClerkKeys) {
    console.log('ℹ Using mock Clerk keys for testing');
  } else if (!hasTestUser) {
    console.log('⚠ Clerk keys found but no test user configured');
    console.log(
      '  Set E2E_CLERK_USER_USERNAME and E2E_CLERK_USER_PASSWORD for authenticated tests'
    );
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
    NEXT_PUBLIC_SUPABASE_URL:
      process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://dummy.supabase.co',
    // Ensure Supabase client keys exist so server can boot locally
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY:
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY || 'pub_dummy',
    NEXT_PUBLIC_SUPABASE_ANON_KEY:
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'anon_dummy',
    SUPABASE_SERVICE_ROLE_KEY:
      process.env.SUPABASE_SERVICE_ROLE_KEY || 'dummy_key',
    // Helpful default for links and sitemap-related logic
    NEXT_PUBLIC_APP_URL:
      process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3100',
  });

  // OPTIMIZATION: Skip browser warmup for smoke tests
  if (process.env.SMOKE_ONLY === '1') {
    console.log('⚡ Skipping browser warmup for smoke tests');
    return;
  }

  // Start browser to warm up
  const browser = await chromium.launch();
  const page = await browser.newPage();

  // Navigate to the app to ensure it's ready
  const baseURL = process.env.BASE_URL || 'http://localhost:3100';
  await page.goto(baseURL, { waitUntil: 'domcontentloaded' });

  // Wait for the page to load completely
  await page.waitForLoadState('domcontentloaded', { timeout: 10000 });

  await browser.close();
}

export default globalSetup;
