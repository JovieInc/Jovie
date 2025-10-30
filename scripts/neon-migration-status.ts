#!/usr/bin/env node

/**
 * Neon Migration Status Checker
 *
 * This script checks the current migration status of a Neon database:
 * - Lists applied migrations from __drizzle_migrations table
 * - Compares with local migration files
 * - Identifies any discrepancies
 *
 * Usage:
 *   pnpm neon:migration:status
 */

import { config } from 'dotenv';
import { existsSync, readFileSync } from 'fs';
import path from 'path';
import postgres from 'postgres';

// Load environment variables
config({ path: '.env.local', override: true });
config();

// Type definitions
interface AppliedMigration {
  hash: string;
  created_at: bigint | number;
}

interface LocalMigration {
  idx: number;
  version: string;
  when: number;
  tag: string;
  breakpoints: boolean;
}

interface SchemaEnum {
  typname: string;
}

interface SchemaTable {
  tablename: string;
}

// Neon URL pattern for cleaning database URLs
const NEON_URL_PATTERN = /(postgres)(|ql)(\+neon)(.*)/;

// ANSI color codes
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

async function checkMigrationStatus() {
  log.section('Neon Migration Status');

  if (!process.env.DATABASE_URL) {
    log.error('DATABASE_URL environment variable is not set');
    process.exit(1);
  }

  const rawUrl = process.env.DATABASE_URL;
  const databaseUrl = rawUrl.replace(NEON_URL_PATTERN, 'postgres$2$4');

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
    // Check if migration table exists
    log.section('Migration History Table');
    const tableExists = await sql`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = '__drizzle_migrations'
      ) as exists
    `;

    if (!tableExists[0]?.exists) {
      log.warning('Migration history table does not exist');
      log.info('This is normal for a fresh database');
      await sql.end();
      return;
    }

    log.success('Migration history table exists');

    // Get applied migrations
    log.section('Applied Migrations');
    const appliedMigrations = (await sql`
      SELECT hash, created_at
      FROM __drizzle_migrations
      ORDER BY created_at ASC
    `) as AppliedMigration[];

    if (appliedMigrations.length === 0) {
      log.warning('No migrations have been applied yet');
    } else {
      log.info(`Found ${appliedMigrations.length} applied migration(s):\n`);
      appliedMigrations.forEach((m: AppliedMigration, i: number) => {
        try {
          // created_at is a bigint timestamp, convert to Date
          const timestamp =
            typeof m.created_at === 'bigint'
              ? Number(m.created_at)
              : m.created_at;
          let date = 'unknown';
          if (timestamp) {
            const dateObj = new Date(timestamp);
            date = isNaN(dateObj.getTime())
              ? `timestamp: ${timestamp}`
              : dateObj.toISOString();
          }
          console.log(`  ${i + 1}. ${m.hash} (${date})`);
        } catch {
          console.log(`  ${i + 1}. ${m.hash} (error formatting date)`);
        }
      });
    }

    // Get local migration files
    log.section('Local Migration Files');
    const migrationsPath = path.join(process.cwd(), 'drizzle', 'migrations');

    if (!existsSync(migrationsPath)) {
      log.warning('No migrations directory found');
      await sql.end();
      return;
    }

    const metaPath = path.join(migrationsPath, 'meta', '_journal.json');
    if (!existsSync(metaPath)) {
      log.warning('No migration journal found');
      await sql.end();
      return;
    }

    const journal = JSON.parse(readFileSync(metaPath, 'utf8'));
    const localMigrations = (journal.entries || []) as LocalMigration[];

    log.info(`Found ${localMigrations.length} local migration(s):\n`);
    localMigrations.forEach((m: LocalMigration, i: number) => {
      console.log(`  ${i + 1}. ${m.tag} (${m.when})`);
    });

    // Compare
    log.section('Status Summary');

    const appliedHashes = new Set(
      appliedMigrations.map((m: AppliedMigration) => m.hash)
    );
    const localHashes = new Set(
      localMigrations.map((m: LocalMigration) => m.tag)
    );

    const pendingMigrations = localMigrations.filter(
      (m: LocalMigration) => !appliedHashes.has(m.tag)
    );
    const extraApplied = appliedMigrations.filter(
      (m: AppliedMigration) => !localHashes.has(m.hash)
    );

    if (pendingMigrations.length === 0 && extraApplied.length === 0) {
      log.success('Database is up to date with local migrations');
    } else {
      if (pendingMigrations.length > 0) {
        log.warning(
          `${pendingMigrations.length} pending migration(s) to apply:`
        );
        pendingMigrations.forEach((m: LocalMigration) => {
          console.log(`  - ${m.tag}`);
        });
      }

      if (extraApplied.length > 0) {
        log.error(
          `${extraApplied.length} migration(s) in database but not in local files:`
        );
        extraApplied.forEach((m: AppliedMigration) => {
          console.log(`  - ${m.hash}`);
        });
        log.warning('This may indicate a sync issue');
      }
    }

    // Check for common schema objects
    log.section('Schema Objects');

    const enums = (await sql`
      SELECT typname
      FROM pg_type
      WHERE typtype = 'e'
      AND typnamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')
      ORDER BY typname
    `) as SchemaEnum[];

    log.info(`Found ${enums.length} ENUM type(s):`);
    enums.forEach((e: SchemaEnum) => {
      console.log(`  - ${e.typname}`);
    });

    const tables = (await sql`
      SELECT tablename
      FROM pg_tables
      WHERE schemaname = 'public'
      AND tablename != '__drizzle_migrations'
      ORDER BY tablename
    `) as SchemaTable[];

    log.info(`\nFound ${tables.length} table(s):`);
    tables.forEach((t: SchemaTable) => {
      console.log(`  - ${t.tablename}`);
    });
  } catch (error) {
    log.error(`Error checking migration status: ${error}`);
    process.exit(1);
  } finally {
    await sql.end();
    log.info('\nDatabase connection closed');
  }
}

if (require.main === module) {
  checkMigrationStatus().catch(error => {
    log.error(`Unexpected error: ${error}`);
    process.exit(1);
  });
}

export { checkMigrationStatus };
