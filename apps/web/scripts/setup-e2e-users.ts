#!/usr/bin/env tsx
/**
 * E2E Test User Setup Script
 *
 * Creates test users in Clerk for E2E testing. Run this ONCE to set up your
 * test environment, then reuse the generated user IDs across all test runs.
 *
 * Usage:
 *   doppler run -- pnpm tsx scripts/setup-e2e-users.ts
 *
 * What this does:
 * 1. Creates test users in Clerk with password authentication
 * 2. Tags users with metadata { role: 'e2e', env: 'test' }
 * 3. Outputs user IDs and credentials to add to Doppler
 *
 * Prerequisites:
 * - CLERK_SECRET_KEY must be set (from Doppler or .env)
 * - Must be using a Clerk test instance (pk_test_...)
 */

import { createClerkClient } from '@clerk/backend';

interface TestUser {
  username: string;
  email: string;
  firstName: string;
  lastName: string;
  metadata: {
    role: string;
    env: string;
    purpose: string;
  };
}

const TEST_USERS: TestUser[] = [
  {
    username: 'e2e-test-user',
    email: 'e2e+clerk_test@jov.ie',
    firstName: 'E2E',
    lastName: 'Test',
    metadata: {
      role: 'e2e',
      env: 'test',
      purpose: 'Primary E2E test user for authenticated dashboard tests',
    },
  },
  {
    username: 'e2e-test-user-2',
    email: 'e2e-2+clerk_test@jov.ie',
    firstName: 'E2E',
    lastName: 'Test 2',
    metadata: {
      role: 'e2e',
      env: 'test',
      purpose: 'Secondary E2E test user for multi-user scenarios',
    },
  },
];

async function setupE2EUsers() {
  console.log('🔧 Setting up E2E test users in Clerk...\n');

  // Validate environment
  const secretKey = process.env.CLERK_SECRET_KEY;
  if (!secretKey) {
    console.error('❌ Error: CLERK_SECRET_KEY not found');
    console.error(
      '   Run with: doppler run -- pnpm tsx scripts/setup-e2e-users.ts'
    );
    process.exit(1);
  }

  // Verify we're using a test instance
  if (!secretKey.startsWith('sk_test_')) {
    console.error(
      '❌ Error: CLERK_SECRET_KEY must be from a test instance (sk_test_...)'
    );
    console.error(
      '   Production keys are not allowed for E2E test user creation'
    );
    process.exit(1);
  }

  console.log('✓ Using Clerk test instance\n');

  const clerk = createClerkClient({ secretKey });
  const createdUsers: Array<{
    username: string;
    email: string;
    clerkId: string;
  }> = [];

  for (const testUser of TEST_USERS) {
    console.log(`Creating user: ${testUser.username} (${testUser.email})`);

    try {
      // Check if user already exists
      const existingUsers = await clerk.users.getUserList({
        emailAddress: [testUser.email],
      });

      if (existingUsers.data.length > 0) {
        const existing = existingUsers.data[0];
        console.log(`  ⚠ User already exists (ID: ${existing.id})`);
        console.log(`  Skipping creation, using existing user\n`);

        createdUsers.push({
          username: testUser.username,
          email: testUser.email,
          clerkId: existing.id,
        });
        continue;
      }

      // Create user with OTP email authentication (no password needed)
      const user = await clerk.users.createUser({
        username: testUser.username,
        emailAddress: [testUser.email],
        firstName: testUser.firstName,
        lastName: testUser.lastName,
        publicMetadata: testUser.metadata,
        skipPasswordRequirement: true, // App uses OTP, not passwords
      });

      console.log(`  ✓ Created user (ID: ${user.id})`);
      console.log(
        `  ✓ Tagged with metadata: ${JSON.stringify(testUser.metadata)}\n`
      );

      createdUsers.push({
        username: testUser.username,
        email: testUser.email,
        clerkId: user.id,
      });
    } catch (error) {
      console.error(`  ❌ Failed to create user: ${error}`);
      if (error instanceof Error) {
        console.error(`     ${error.message}`);
      }
      process.exit(1);
    }
  }

  // Output results
  console.log('\n' + '='.repeat(80));
  console.log('✅ E2E Test Users Setup Complete!');
  console.log('='.repeat(80) + '\n');

  console.log('📋 Add these secrets to Doppler (dev config):\n');

  console.log('# Primary E2E User');
  console.log(`E2E_CLERK_USER_ID=${createdUsers[0].clerkId}`);
  console.log(`E2E_CLERK_USER_USERNAME=${createdUsers[0].email}`);

  if (createdUsers.length > 1) {
    console.log('\n# Secondary E2E User (for multi-user tests)');
    console.log(`E2E_CLERK_USER_2_ID=${createdUsers[1].clerkId}`);
    console.log(`E2E_CLERK_USER_2_USERNAME=${createdUsers[1].email}`);
  }

  console.log(
    '\n💡 Note: Uses OTP email authentication (code: 424242 for test emails)'
  );

  console.log('\n' + '='.repeat(80));
  console.log('📝 Next Steps:');
  console.log('='.repeat(80));
  console.log('1. Copy the secrets above to Doppler:');
  console.log(
    '   → https://dashboard.doppler.com/workplace/YOUR_WORKSPACE/projects/jovie-web/configs/dev'
  );
  console.log('2. Run the seed script to create DB records:');
  console.log('   → doppler run -- pnpm tsx tests/seed-test-data.ts');
  console.log('3. Run your E2E tests:');
  console.log('   → doppler run -- pnpm playwright test');
  console.log(
    '\n💡 These users will be reused across all test runs (no need to recreate)'
  );
  console.log('');
}

// Run the setup
setupE2EUsers().catch(error => {
  console.error('\n❌ Setup failed:', error);
  process.exit(1);
});
