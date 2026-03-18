#!/usr/bin/env tsx

/**
 * E2E Test User Cleanup Script
 *
 * Removes E2E test users from Clerk and their corresponding database records.
 *
 * Usage:
 *   doppler run -- pnpm tsx scripts/cleanup-e2e-users.ts           # interactive
 *   doppler run -- pnpm tsx scripts/cleanup-e2e-users.ts --force   # non-interactive (for agents/CI)
 *   doppler run -- pnpm tsx scripts/cleanup-e2e-users.ts --dry-run # preview without deleting
 *
 * What this does:
 * 1. Finds all Clerk users with metadata { role: 'e2e' } OR +clerk_test email (paginated)
 * 2. Prompts for confirmation (unless --force)
 * 3. Deletes users from Clerk in batches (rate-limit safe)
 * 4. Deletes matching database records by clerkId (FK CASCADE handles children)
 *
 * Prerequisites:
 * - CLERK_SECRET_KEY must be set (from Doppler or .env), must be sk_test_...
 * - DATABASE_URL (optional) — if set, also cleans database records
 */

import * as readline from 'node:readline';
import type { User } from '@clerk/backend';
import { createClerkClient } from '@clerk/backend';

// CLI flags
const args = process.argv.slice(2);
const isForce = args.includes('--force') || args.includes('--yes');
const isDryRun = args.includes('--dry-run');

const BATCH_SIZE = 25;
const BATCH_DELAY_MS = 100;
const MAX_RETRIES = 3;
const INITIAL_BACKOFF_MS = 200;

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

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Find all E2E test users across all pages.
 */
async function findAllE2EUsers(
  clerk: ReturnType<typeof createClerkClient>
): Promise<User[]> {
  const allE2EUsers: User[] = [];
  let offset = 0;
  const pageSize = 100;

  while (true) {
    const page = await clerk.users.getUserList({
      limit: pageSize,
      offset,
    });

    const e2eUsersInPage = page.data.filter(user => {
      // Match users with explicit e2e metadata tag
      const metadata = user.publicMetadata as { role?: string };
      if (metadata?.role === 'e2e') return true;

      // Match dynamically-created test users by +clerk_test email pattern
      // These are created by createOrReuseTestUserSession() without metadata
      const email = user.emailAddresses.find(
        e => e.id === user.primaryEmailAddressId
      )?.emailAddress;
      if (email?.includes('+clerk_test')) return true;

      return false;
    });

    allE2EUsers.push(...e2eUsersInPage);

    // If we got fewer than pageSize results, we've reached the end
    if (page.data.length < pageSize) {
      break;
    }

    offset += pageSize;
  }

  return allE2EUsers;
}

/**
 * Delete a single Clerk user with retry on rate limit.
 */
async function deleteClerkUser(
  clerk: ReturnType<typeof createClerkClient>,
  userId: string
): Promise<boolean> {
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      await clerk.users.deleteUser(userId);
      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);

      // Rate limited — backoff and retry
      if (message.includes('429') || message.includes('rate')) {
        const backoff = INITIAL_BACKOFF_MS * 2 ** attempt;
        console.log(
          `  ⏳ Rate limited on ${userId}, waiting ${backoff}ms (attempt ${attempt + 1}/${MAX_RETRIES})`
        );
        await sleep(backoff);
        continue;
      }

      // User already deleted
      if (message.includes('404') || message.includes('not found')) {
        console.log(`  ⚠ ${userId} already deleted, skipping`);
        return true;
      }

      // Other error — don't retry
      console.error(`  ❌ Failed to delete ${userId}: ${message}`);
      return false;
    }
  }

  console.error(`  ❌ Failed to delete ${userId} after ${MAX_RETRIES} retries`);
  return false;
}

/**
 * Delete matching database records for cleaned-up Clerk users.
 */
async function cleanupDatabaseRecords(
  clerkIds: string[]
): Promise<{ deleted: number; notFound: number; failed: number }> {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.log('\n⚠ DATABASE_URL not set, skipping database cleanup');
    return { deleted: 0, notFound: 0, failed: clerkIds.length };
  }

  // Safety check: don't run against production
  if (databaseUrl.toLowerCase().includes('production')) {
    console.error(
      '❌ DATABASE_URL appears to be a production database. Skipping DB cleanup.'
    );
    return { deleted: 0, notFound: 0, failed: clerkIds.length };
  }

  // Dynamic imports to avoid requiring DB deps when only doing Clerk cleanup
  const { neon } = await import('@neondatabase/serverless');
  const { eq } = await import('drizzle-orm');
  const { drizzle } = await import('drizzle-orm/neon-http');
  const schema = await import('@/lib/db/schema');

  const sql = neon(databaseUrl);
  const db = drizzle(sql, { schema });

  let deleted = 0;
  let notFound = 0;
  let failed = 0;

  console.log('\nCleaning up database records...');

  for (const clerkId of clerkIds) {
    try {
      const result = await db
        .delete(schema.users)
        .where(eq(schema.users.clerkId, clerkId))
        .returning({ id: schema.users.id });

      if (result.length > 0) {
        console.log(`  ✓ Deleted DB record for ${clerkId}`);
        deleted++;
      } else {
        console.log(`  - No DB record for ${clerkId}`);
        notFound++;
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`  ❌ DB cleanup failed for ${clerkId}: ${message}`);
      failed++;
    }
  }

  return { deleted, notFound, failed };
}

async function cleanupE2EUsers() {
  console.log('🧹 Cleaning up E2E test users...\n');

  if (isDryRun) {
    console.log('DRY RUN — no users will be deleted\n');
  }

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
    // Find all E2E test users (paginated)
    console.log('Searching for E2E test users (all pages)...');
    const e2eUsers = await findAllE2EUsers(clerk);

    if (e2eUsers.length === 0) {
      console.log('✓ No E2E test users found\n');
      return;
    }

    console.log(`\nFound ${e2eUsers.length} E2E test user(s):\n`);
    for (const user of e2eUsers) {
      const email =
        user.emailAddresses.find(e => e.id === user.primaryEmailAddressId)
          ?.emailAddress || 'no email';
      const created = new Date(user.createdAt).toISOString().split('T')[0];
      console.log(`  - ${user.id} (${email}) created ${created}`);
    }

    console.log('');

    // Dry run — stop here
    if (isDryRun) {
      console.log(
        `DRY RUN complete. ${e2eUsers.length} user(s) would be deleted.\n`
      );
      return;
    }

    // Prompt for confirmation (unless --force)
    if (!isForce) {
      const confirmed = await prompt('Delete these users?');
      if (!confirmed) {
        console.log('\n⚠ Cleanup cancelled\n');
        return;
      }
    }

    // Delete Clerk users in batches
    console.log('\nDeleting Clerk users...');
    let clerkDeleted = 0;
    let clerkFailed = 0;
    const deletedClerkIds: string[] = [];

    for (let i = 0; i < e2eUsers.length; i += BATCH_SIZE) {
      const batch = e2eUsers.slice(i, i + BATCH_SIZE);

      for (const user of batch) {
        const success = await deleteClerkUser(clerk, user.id);
        if (success) {
          clerkDeleted++;
          deletedClerkIds.push(user.id);
          console.log(`  ✓ Deleted ${user.id}`);
        } else {
          clerkFailed++;
        }
      }

      // Delay between batches to respect rate limits
      if (i + BATCH_SIZE < e2eUsers.length) {
        await sleep(BATCH_DELAY_MS);
      }
    }

    // Clean up database records for successfully deleted Clerk users
    const dbResult =
      deletedClerkIds.length > 0
        ? await cleanupDatabaseRecords(deletedClerkIds)
        : { deleted: 0, notFound: 0, failed: 0 };

    // Summary
    console.log('\n' + '='.repeat(40));
    console.log('Cleanup complete:');
    console.log(`  Clerk users found:    ${e2eUsers.length}`);
    console.log(`  Clerk users deleted:  ${clerkDeleted}`);
    console.log(`  Clerk deletions failed: ${clerkFailed}`);
    if (process.env.DATABASE_URL) {
      console.log(`  DB records deleted:   ${dbResult.deleted}`);
      console.log(`  DB records not found: ${dbResult.notFound}`);
      if (dbResult.failed > 0) {
        console.log(`  DB deletions failed:  ${dbResult.failed}`);
      }
    }
    console.log('='.repeat(40));
    console.log(
      '\n💡 Run scripts/setup-e2e-users.ts to create fresh test users\n'
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
