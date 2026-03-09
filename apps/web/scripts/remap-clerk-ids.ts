#!/usr/bin/env -S tsx

/**
 * Remap Clerk IDs after resetting a dev Neon branch from production data.
 *
 * Production uses a different Clerk instance than dev, so user records
 * carry production clerk_ids that don't match the dev Clerk users.
 * This script updates clerk_ids for known dev users so auth works locally.
 *
 * Usage:
 *   pnpm --filter web exec tsx scripts/remap-clerk-ids.ts
 *
 * The script reads DATABASE_URL from Doppler (or .env.local) and updates
 * clerk_ids based on the mapping below. Add your dev user mappings here.
 */

import { resolve } from 'node:path';
import { neon } from '@neondatabase/serverless';
import { config as dotenvConfig } from 'dotenv';

// Load .env.local for DATABASE_URL if not provided by Doppler
dotenvConfig({ path: resolve(import.meta.dirname, '..', '.env.local') });

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error('DATABASE_URL not set. Run via Doppler or set in .env.local.');
  process.exit(1);
}

// ── Dev user mappings ──────────────────────────────────────────────────────
// Map email → dev Clerk user ID.
// Add entries here for each team member who uses a local dev environment.
const DEV_CLERK_MAPPINGS: Record<string, string> = {
  'tim@jov.ie': 'user_38JQ1fH3AvyXcuAYrXq7MMQIB1b',
};

// ── Execute ────────────────────────────────────────────────────────────────

async function main() {
  const sql = neon(DATABASE_URL!);

  console.log('Remapping Clerk IDs for dev environment...\n');

  for (const [email, devClerkId] of Object.entries(DEV_CLERK_MAPPINGS)) {
    const result = await sql`
      UPDATE users
      SET clerk_id = ${devClerkId}, updated_at = NOW()
      WHERE email = ${email}
      RETURNING id, clerk_id, email
    `;

    if (result.length > 0) {
      console.log(`  ✓ ${email} → ${devClerkId}`);
    } else {
      console.log(`  ✗ ${email} — no matching user found in DB`);
    }
  }

  console.log('\nDone. Restart your dev server to pick up the changes.');
}

main().catch(err => {
  console.error('Failed:', err);
  process.exit(1);
});
