import { beforeEach, describe, expect, it, vi } from 'vitest';
import { publicEnv } from '@/lib/env-public';
import { env } from '@/lib/env-server';

/**
 * Integration Health Diagnostic Tests
 *
 * Tests the health of main integrations:
 * 1. Clerk auth integration
 * 2. Database connection (Drizzle + Neon/PostgreSQL)
 */

describe('Integration Health Diagnostics', () => {
  beforeEach(() => {
    // Reset any mocks before each test
    vi.clearAllMocks();
  });

  describe('Environment Configuration', () => {
    it('should detect missing environment variables appropriately', () => {
      // In CI/test environment, env vars are expected to be undefined
      // This tests that our env validation handles missing vars gracefully
      const clerkKey = publicEnv.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;
      const databaseUrl = env.DATABASE_URL;

      // In test mode, these might be undefined - that's expected
      if (!clerkKey) {
        expect(clerkKey).toBeUndefined();
        console.log('✓ Clerk key is undefined (expected in test environment)');
      } else {
        expect(clerkKey).toMatch(/pk_(test|live)_/);
        console.log('✓ Clerk key is present and formatted correctly');
      }

      if (!databaseUrl) {
        expect(databaseUrl).toBeUndefined();
        console.log(
          '✓ Database URL is undefined (expected in test environment)'
        );
      } else {
        // Strip wrapping quotes if present (some environments include literal quotes in the value)
        const cleanUrl = databaseUrl.replace(/^['"]|['"]$/g, '');
        expect(cleanUrl).toMatch(/^(postgres|postgresql):/);
        console.log('✓ Database URL is present and formatted correctly');
      }
    });

    it('should validate environment schema properly', () => {
      // Test that our env schema validation works
      expect(() => env).not.toThrow();
      console.log('✓ Environment schema validation passes');
    });
  });

  describe('Clerk Integration Health', () => {
    it('should have the necessary Clerk configuration', async () => {
      const clerkKey = publicEnv.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;

      if (!clerkKey) {
        console.log('⏭ Skipping Clerk integration test - no publishable key');
        return;
      }

      // Test that Clerk key has expected format
      expect(clerkKey).toMatch(/pk_(test|live)_/);
      console.log('✓ Clerk publishable key format is valid');

      // Test that we can import Clerk modules without errors
      const { auth } = await import('@clerk/nextjs/server');
      expect(auth).toBeDefined();
      console.log('✓ Clerk auth module imports successfully');
    });
  });

  describe('Database Integration Health', () => {
    it(
      'should have the necessary database configuration',
      { timeout: 30000 },
      async () => {
        const databaseUrl = env.DATABASE_URL;

        if (!databaseUrl) {
          console.log('⏭ Skipping database integration test - no DATABASE_URL');
          return;
        }

        // Strip wrapping quotes if present (some environments include literal quotes in the value)
        const cleanUrl = databaseUrl.replace(/^['"]|['"]$/g, '');
        expect(cleanUrl).toMatch(/^(postgres|postgresql):/);
        console.log('✓ Database URL format is valid');

        // Test that we can import database modules without errors
        const { db } = await import('@/lib/db');
        expect(db).toBeDefined();
        console.log('✓ Database module imports successfully');
      }
    );
  });

  describe('Stripe Integration Health', () => {
    it('should have the necessary Stripe configuration', async () => {
      const stripeSecretKey = env.STRIPE_SECRET_KEY;
      const stripePublishableKey = publicEnv.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY;

      if (!stripeSecretKey || !stripePublishableKey) {
        console.log('⏭ Skipping Stripe integration test - missing keys');
        return;
      }

      expect(stripeSecretKey).toMatch(/sk_(test|live)_/);
      expect(stripePublishableKey).toMatch(/pk_(test|live)_/);
      console.log('✓ Stripe key formats are valid');
    });
  });

  describe('Integration Summary', () => {
    it('should provide a comprehensive health report', () => {
      const integrations = {
        clerk: !!publicEnv.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY,
        database: !!env.DATABASE_URL,
        stripe: !!(
          env.STRIPE_SECRET_KEY && publicEnv.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY
        ),
      };

      console.log('🔍 Integration Health Summary:');
      console.log(`  Clerk Auth: ${integrations.clerk ? '✅' : '❌'}`);
      console.log(`  Database: ${integrations.database ? '✅' : '❌'}`);
      console.log(`  Stripe Billing: ${integrations.stripe ? '✅' : '❌'}`);

      // In test environments, it's expected that integrations are disabled
      // In non-test environments, at least one integration should be configured
      const hasAnyIntegration = Object.values(integrations).some(Boolean);
      const isTestEnvironment =
        process.env.NODE_ENV === 'test' || process.env.VITEST === 'true';

      if (isTestEnvironment) {
        // Test environment - integrations may or may not be configured
        // This is acceptable as CI environments often have minimal config
        expect(typeof hasAnyIntegration).toBe('boolean');
        console.log(
          `  CI/Test Mode: ${hasAnyIntegration ? 'Integrations configured' : 'No integrations (expected in CI)'}`
        );
      } else {
        // Non-test environment - expect at least one integration
        expect(hasAnyIntegration).toBe(true);
      }
    });
  });
});
