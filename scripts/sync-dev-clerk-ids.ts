#!/usr/bin/env tsx
/**
 * Sync dev Clerk user IDs to the shared database.
 *
 * The dev Clerk instance assigns different user IDs than production Clerk.
 * When the shared DB has production clerk_ids, local auth fails with
 * USER_CREATION_FAILED because the email uniqueness constraint blocks
 * creating a new row, and the clerk_id-based upsert can't find the user.
 *
 * This script queries the dev Clerk instance for all users and updates
 * any mismatched clerk_ids in the DB.
 *
 * Usage: doppler run -p jovie-web -c dev -- pnpm tsx scripts/sync-dev-clerk-ids.ts
 */
import { createClerkClient } from '@clerk/backend';
import { neon } from '@neondatabase/serverless';

const DATABASE_URL = process.env.DATABASE_URL;
const CLERK_SECRET_KEY = process.env.CLERK_SECRET_KEY;

if (!DATABASE_URL || !CLERK_SECRET_KEY) {
  console.error('Missing DATABASE_URL or CLERK_SECRET_KEY');
  process.exit(1);
}

// Only run against dev/test Clerk instances
if (!CLERK_SECRET_KEY.startsWith('sk_test_')) {
  console.error('Safety: refusing to run against a non-test Clerk instance');
  process.exit(1);
}

const sql = neon(DATABASE_URL);
const clerk = createClerkClient({ secretKey: CLERK_SECRET_KEY });

async function main() {
  // Get all users from the dev Clerk instance
  const clerkUsers = await clerk.users.getUserList({ limit: 100 });

  let synced = 0;
  let skipped = 0;

  for (const clerkUser of clerkUsers.data) {
    const email = clerkUser.emailAddresses[0]?.emailAddress;
    if (!email) continue;

    // Check if DB has this email with a different clerk_id
    const rows = await sql`
      SELECT id, clerk_id FROM users WHERE email = ${email} LIMIT 1
    `;

    if (rows.length === 0) {
      skipped++;
      continue;
    }

    const dbRow = rows[0];
    if (dbRow.clerk_id === clerkUser.id) {
      skipped++;
      continue;
    }

    // Update the clerk_id to match the dev instance
    await sql`
      UPDATE users SET clerk_id = ${clerkUser.id}, updated_at = NOW()
      WHERE email = ${email}
    `;
    console.log(`  Synced ${email}: ${dbRow.clerk_id} → ${clerkUser.id}`);
    synced++;
  }

  if (synced > 0) {
    console.log(`Synced ${synced} user(s), ${skipped} already matched`);
  }
}

main().catch(err => {
  console.error('Sync failed:', err.message);
  process.exit(1);
});
