#!/usr/bin/env node

/**
 * Emergency Script: Apply Missing Onboarding Migration
 *
 * This script applies only the onboarding_create_profile() function migration
 * to fix the preview.jov.ie 500 error.
 *
 * Usage:
 *   DATABASE_URL="postgresql://..." pnpm tsx scripts/apply-onboarding-migration.ts
 */

import { readFileSync } from 'fs';
import path from 'path';
import postgres from 'postgres';

// ANSI color codes
const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
};

const log = {
  info: (msg: string) => console.log(`${colors.blue}ℹ${colors.reset} ${msg}`),
  success: (msg: string) =>
    console.log(`${colors.green}✓${colors.reset} ${msg}`),
  warning: (msg: string) =>
    console.log(`${colors.yellow}⚠${colors.reset} ${msg}`),
  error: (msg: string) => console.error(`${colors.red}✗${colors.reset} ${msg}`),
  section: (msg: string) =>
    console.log(`\n${colors.cyan}═══ ${msg} ═══${colors.reset}\n`),
};

async function applyOnboardingMigration() {
  log.section('Emergency Onboarding Migration');

  // Validate environment
  if (!process.env.DATABASE_URL) {
    log.error('DATABASE_URL environment variable is required');
    log.info(
      'Usage: DATABASE_URL="postgresql://..." pnpm tsx scripts/apply-onboarding-migration.ts'
    );
    process.exit(1);
  }

  const databaseUrl = process.env.DATABASE_URL;
  log.info(`Connecting to database...`);

  // Connect to database
  const sql = postgres(databaseUrl, {
    ssl: true,
    max: 1,
    onnotice: () => {}, // Suppress notices
  });

  try {
    // Check if function already exists
    log.info('Checking if onboarding_create_profile() function exists...');

    const functionCheck = await sql`
      SELECT EXISTS (
        SELECT 1
        FROM pg_proc p
        JOIN pg_namespace n ON p.pronamespace = n.oid
        WHERE n.nspname = 'public'
        AND p.proname = 'onboarding_create_profile'
      ) as exists
    `;

    if (functionCheck[0]?.exists) {
      log.success('Function onboarding_create_profile() already exists');
      log.info('No migration needed. The database is up to date.');
      await sql.end();
      process.exit(0);
    }

    log.warning('Function onboarding_create_profile() does NOT exist');
    log.info('Applying migration...');

    // Read migration file
    const migrationPath = path.join(
      process.cwd(),
      'drizzle',
      'migrations',
      '0001_onboarding_function.sql'
    );

    const migrationSQL = readFileSync(migrationPath, 'utf8');

    log.info(`Migration file: ${migrationPath}`);
    log.info(`Migration size: ${migrationSQL.length} bytes`);

    // Apply migration
    log.info('Executing migration SQL...');
    await sql.unsafe(migrationSQL);

    log.success('Migration applied successfully!');

    // Verify function was created
    const verifyCheck = await sql`
      SELECT EXISTS (
        SELECT 1
        FROM pg_proc p
        JOIN pg_namespace n ON p.pronamespace = n.oid
        WHERE n.nspname = 'public'
        AND p.proname = 'onboarding_create_profile'
      ) as exists
    `;

    if (verifyCheck[0]?.exists) {
      log.success('Verified: onboarding_create_profile() function now exists');
    } else {
      log.error('Verification failed: Function was not created');
      process.exit(1);
    }

    // Update migration history (optional - prevents re-running)
    log.info('Updating migration history...');

    await sql`
      INSERT INTO __drizzle_migrations (hash, created_at)
      VALUES ('manual_onboarding_fix_' || extract(epoch from now()), now())
      ON CONFLICT DO NOTHING
    `;

    log.success('Migration history updated');
    log.section('Migration Complete');
    log.success('preview.jov.ie onboarding should now work!');
  } catch (error) {
    log.error(`Migration failed: ${error}`);
    throw error;
  } finally {
    await sql.end();
    log.info('Database connection closed');
  }
}

// Run migration
applyOnboardingMigration().catch(error => {
  log.error(`Unexpected error: ${error}`);
  process.exit(1);
});
