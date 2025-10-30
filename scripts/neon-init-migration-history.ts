#!/usr/bin/env node

/**
 * Initialize Migration History for Existing Neon Database
 *
 * This script initializes the __drizzle_migrations table and marks
 * all existing migrations as applied. Use this when:
 * - Database schema exists but migration history doesn't
 * - Database was created via drizzle-kit push
 * - Migrating from manual schema to migration-based workflow
 *
 * Usage:
 *   pnpm neon:init:migration-history
 */

import { config } from 'dotenv';
import { existsSync, readFileSync } from 'fs';
import path from 'path';
import postgres from 'postgres';

// Load environment variables
config({ path: '.env.local', override: true });
config();

// Neon URL pattern
const NEON_URL_PATTERN = /(postgres)(|ql)(\+neon)(.*)/;

// ANSI colors
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
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
    console.log(
      `\n${colors.bright}${colors.cyan}═══ ${msg} ═══${colors.reset}\n`
    ),
};

async function initMigrationHistory() {
  log.section('Initialize Migration History');

  if (!process.env.DATABASE_URL) {
    log.error('DATABASE_URL environment variable is not set');
    process.exit(1);
  }

  const rawUrl = process.env.DATABASE_URL;
  const databaseUrl = rawUrl.replace(NEON_URL_PATTERN, 'postgres$2$4');

  // Get local migrations
  const migrationsPath = path.join(process.cwd(), 'drizzle', 'migrations');
  const metaPath = path.join(migrationsPath, 'meta', '_journal.json');

  if (!existsSync(metaPath)) {
    log.error(
      'No migration journal found at drizzle/migrations/meta/_journal.json'
    );
    log.info('Run "pnpm drizzle:generate" first to create migrations');
    process.exit(1);
  }

  const journal = JSON.parse(readFileSync(metaPath, 'utf8'));
  const migrations = journal.entries || [];

  if (migrations.length === 0) {
    log.warning('No migrations found in journal');
    process.exit(0);
  }

  log.info(`Found ${migrations.length} migration(s) in journal`);

  let sql: postgres.Sql;

  try {
    log.info('Connecting to database...');
    sql = postgres(databaseUrl, {
      ssl: true,
      max: 1,
      onnotice: () => {},
    });
    log.success('Connected');
  } catch (error) {
    log.error(`Failed to connect: ${error}`);
    process.exit(1);
  }

  try {
    // Check if table already exists
    const tableExists = await sql`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = '__drizzle_migrations'
      ) as exists
    `;

    if (tableExists[0]?.exists) {
      log.warning('Migration history table already exists');

      const existing =
        await sql`SELECT COUNT(*) as count FROM __drizzle_migrations`;
      log.info(`Current migration count: ${existing[0].count}`);

      log.error('Aborting to prevent data loss');
      log.info('If you want to reset, manually drop the table first:');
      log.info('  DROP TABLE __drizzle_migrations;');
      await sql.end();
      process.exit(1);
    }

    // Create migration history table
    log.info('Creating migration history table...');
    await sql`
      CREATE TABLE IF NOT EXISTS __drizzle_migrations (
        id SERIAL PRIMARY KEY,
        hash text NOT NULL,
        created_at bigint
      )
    `;
    log.success('Migration history table created');

    // Mark all migrations as applied
    log.info('Marking existing migrations as applied...');

    for (const migration of migrations) {
      const timestamp = migration.when || Date.now();
      await sql`
        INSERT INTO __drizzle_migrations (hash, created_at)
        VALUES (${migration.tag}, ${timestamp})
      `;
      log.info(`  ✓ ${migration.tag}`);
    }

    log.success(
      `\nSuccessfully initialized migration history with ${migrations.length} migration(s)`
    );
    log.info('Future migrations will now be tracked properly');
  } catch (error) {
    log.error(`Error: ${error}`);
    process.exit(1);
  } finally {
    await sql.end();
    log.info('\nDatabase connection closed');
  }
}

if (require.main === module) {
  initMigrationHistory().catch(error => {
    log.error(`Unexpected error: ${error}`);
    process.exit(1);
  });
}

export { initMigrationHistory };
