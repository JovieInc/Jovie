#!/usr/bin/env tsx

/**
 * E2E Test User Cleanup Script
 *
 * Removes E2E test users from Clerk. Run this to clean up old test users
 * or reset your test environment.
 *
 * Usage:
 *   doppler run -- pnpm tsx scripts/cleanup-e2e-users.ts
 *
 * What this does:
 * 1. Finds all users with metadata { role: 'e2e' }
 * 2. Prompts for confirmation
 * 3. Deletes users from Clerk
 *
 * Prerequisites:
 * - CLERK_SECRET_KEY must be set (from Doppler or .env)
 * - Must be using a Clerk test instance (sk_test_...)
 */

import * as readline from 'node:readline';
import { createClerkClient } from '@clerk/backend';

async function prompt(question: string): Promise<boolean> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise(resolve => {
    rl.question(`${question} (y/N): `, answer => {
      rl.close();
      resolve(answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes');
    });
  });
}

async function cleanupE2EUsers() {
  console.log('🧹 Cleaning up E2E test users from Clerk...\n');

  // Validate environment
  const secretKey = process.env.CLERK_SECRET_KEY;
  if (!secretKey) {
    console.error('❌ Error: CLERK_SECRET_KEY not found');
    console.error(
      '   Run with: doppler run -- pnpm tsx scripts/cleanup-e2e-users.ts'
    );
    process.exit(1);
  }

  // Verify we're using a test instance
  if (!secretKey.startsWith('sk_test_')) {
    console.error(
      '❌ Error: CLERK_SECRET_KEY must be from a test instance (sk_test_...)'
    );
    console.error('   Production keys are not allowed for cleanup operations');
    process.exit(1);
  }

  console.log('✓ Using Clerk test instance\n');

  const clerk = createClerkClient({ secretKey });

  try {
    // Find all E2E test users
    console.log('Searching for E2E test users...');
    const users = await clerk.users.getUserList({
      limit: 100,
    });

    // Filter users with e2e metadata
    const e2eUsers = users.data.filter(user => {
      const metadata = user.publicMetadata as { role?: string };
      return metadata?.role === 'e2e';
    });

    if (e2eUsers.length === 0) {
      console.log('✓ No E2E test users found\n');
      return;
    }

    console.log(`\nFound ${e2eUsers.length} E2E test user(s):\n`);
    for (const user of e2eUsers) {
      const email =
        user.emailAddresses.find(e => e.id === user.primaryEmailAddressId)
          ?.emailAddress || 'no email';
      console.log(`  - ${user.id} (${email})`);
    }

    console.log('');

    // Prompt for confirmation
    const confirmed = await prompt('Delete these users?');

    if (!confirmed) {
      console.log('\n⚠ Cleanup cancelled\n');
      return;
    }

    // Delete users
    console.log('\nDeleting users...');
    let deletedCount = 0;

    for (const user of e2eUsers) {
      try {
        await clerk.users.deleteUser(user.id);
        console.log(`  ✓ Deleted ${user.id}`);
        deletedCount++;
      } catch (error) {
        console.error(`  ❌ Failed to delete ${user.id}:`, error);
      }
    }

    console.log(
      `\n✅ Cleanup complete! Deleted ${deletedCount}/${e2eUsers.length} users\n`
    );
    console.log(
      '💡 Run scripts/setup-e2e-users.ts to create fresh test users\n'
    );
  } catch (error) {
    console.error('❌ Cleanup failed:', error);
    if (error instanceof Error) {
      console.error(`   ${error.message}`);
    }
    process.exit(1);
  }
}

// Run the cleanup
cleanupE2EUsers().catch(error => {
  console.error('\n❌ Cleanup failed:', error);
  process.exit(1);
});
