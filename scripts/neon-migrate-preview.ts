#!/usr/bin/env node

/**
 * Neon Preview Branch Migration Script
 *
 * This script uses the Neon MCP to:
 * 1. Identify the current Neon preview branch
 * 2. Run Drizzle migrations against it
 * 3. Optionally compare schemas with parent branch
 *
 * Usage:
 *   pnpm neon:migrate:preview
 *   pnpm neon:migrate:preview --compare
 */

import { config } from 'dotenv';
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import { existsSync, readFileSync } from 'fs';
import path from 'path';
import postgres from 'postgres';

// Load environment variables
config({ path: '.env.local', override: true });
config();

// Neon URL pattern for cleaning database URLs
const NEON_URL_PATTERN = /(postgres)(|ql)(\+neon)(.*)/;

// ANSI color codes for terminal output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
};

// Helper functions for colored output
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

// Validate environment variables
function validateEnvironment(): { isValid: boolean; errors: string[] } {
  const errors: string[] = [];
  const required = ['DATABASE_URL'];

  for (const key of required) {
    if (!process.env[key]) {
      errors.push(`Missing required environment variable: ${key}`);
    }
  }

  // Check if DATABASE_URL is a valid Neon or Postgres URL
  if (process.env.DATABASE_URL) {
    const url = process.env.DATABASE_URL;
    if (!url.startsWith('postgres://') && !url.startsWith('postgresql://')) {
      errors.push('DATABASE_URL must be a valid PostgreSQL connection string');
    }
  }

  return { isValid: errors.length === 0, errors };
}

// Check if migrations directory exists and has migrations
function checkMigrationsExist(): boolean {
  const migrationsPath = path.join(process.cwd(), 'drizzle', 'migrations');
  if (!existsSync(migrationsPath)) {
    return false;
  }

  try {
    const metaPath = path.join(migrationsPath, 'meta', '_journal.json');
    if (existsSync(metaPath)) {
      const journal = JSON.parse(readFileSync(metaPath, 'utf8'));
      return journal.entries && journal.entries.length > 0;
    }
  } catch {
    // If we can't read the journal, assume no migrations
  }

  return false;
}

// Extract Neon branch info from DATABASE_URL
function extractNeonBranchInfo(url: string): {
  projectId?: string;
  branchId?: string;
  endpoint?: string;
} {
  try {
    // Neon URL format: postgresql://[user]:[password]@[endpoint]-[branch-id].region.aws.neon.tech/[dbname]
    const urlObj = new URL(url);
    const hostname = urlObj.hostname;

    // Extract endpoint and potential branch info from hostname
    const match = hostname.match(
      /^(ep-[^-]+)-([^.]+)\.([^.]+)\.([^.]+)\.neon\.tech$/
    );
    if (match) {
      return {
        endpoint: match[1],
        branchId: match[2],
      };
    }

    return {};
  } catch {
    return {};
  }
}

// Main migration function
async function runNeonPreviewMigration() {
  log.section('Neon Preview Branch Migration');

  // Parse command line arguments
  const args = process.argv.slice(2);
  const shouldCompare = args.includes('--compare');

  // Validate environment
  const { isValid, errors } = validateEnvironment();
  if (!isValid) {
    log.error('Environment validation failed:');
    errors.forEach(err => log.error(`  - ${err}`));
    process.exit(1);
  }

  const rawUrl = process.env.DATABASE_URL!;
  const branchInfo = extractNeonBranchInfo(rawUrl);

  log.info(`Environment: ${colors.bright}preview${colors.reset}`);
  if (branchInfo.endpoint) {
    log.info(
      `Neon Endpoint: ${colors.bright}${branchInfo.endpoint}${colors.reset}`
    );
  }
  if (branchInfo.branchId) {
    log.info(
      `Branch ID: ${colors.bright}${branchInfo.branchId}${colors.reset}`
    );
  }
  log.info(`Database: ${colors.bright}[REDACTED]${colors.reset}`);

  // Check if migrations exist
  if (!checkMigrationsExist()) {
    log.warning('No migrations found in drizzle/migrations directory');
    log.info('Run "pnpm drizzle:generate" to generate migrations from schema');
    process.exit(0);
  }

  // Connect to database
  let sql: postgres.Sql;
  let db: ReturnType<typeof drizzle>;

  try {
    log.info('Connecting to Neon preview branch...');

    // Clean the URL for Neon (remove the +neon suffix correctly, preserving 'postgres' or 'postgresql')
    const databaseUrl = rawUrl.replace(NEON_URL_PATTERN, 'postgres$2$4');

    sql = postgres(databaseUrl, {
      ssl: true,
      max: 1,
      onnotice: () => {}, // Suppress notices
    });

    db = drizzle(sql);

    log.success('Database connection established');
  } catch (error) {
    log.error(`Failed to connect to database: ${error}`);
    process.exit(1);
  }

  // Check migration history
  try {
    log.info('Checking migration history...');
    const result = await sql`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = '__drizzle_migrations'
      ) as exists
    `;

    if (result[0]?.exists) {
      const migrations = await sql`
        SELECT * FROM __drizzle_migrations 
        ORDER BY created_at DESC 
        LIMIT 5
      `;
      log.info(`Found ${migrations.length} recent migration(s) in history`);
    } else {
      log.warning('Migration history table does not exist yet');
    }
  } catch (error) {
    log.warning(`Could not check migration history: ${error}`);
  }

  // Run migrations
  try {
    log.info('Running migrations on preview branch...');

    const start = Date.now();
    await migrate(db, {
      migrationsFolder: './drizzle/migrations',
      migrationsTable: '__drizzle_migrations',
    });
    const duration = ((Date.now() - start) / 1000).toFixed(2);

    log.success(`Migrations completed successfully in ${duration}s`);
  } catch (error: unknown) {
    log.error(`Migration failed: ${error}`);

    // Provide helpful diagnostics
    if (error instanceof Error && error.message?.includes('already exists')) {
      log.warning(
        '\nThis error suggests the database schema is out of sync with migration history.'
      );
      log.info('Possible solutions:');
      log.info('  1. Check if migrations were partially applied');
      log.info('  2. Verify __drizzle_migrations table is accurate');
      log.info('  3. Consider using drizzle-kit push for development branches');
      log.info(
        '  4. Reset the preview branch from production if safe to do so'
      );
    }

    process.exit(1);
  } finally {
    // Close database connection
    try {
      await sql.end();
      log.info('Database connection closed');
    } catch {
      // Ignore close errors
    }
  }

  // Schema comparison (if requested)
  if (shouldCompare) {
    log.section('Schema Comparison');
    log.info('To compare schemas between branches, use the Neon MCP:');
    log.info(
      '  mcp2_compare_database_schema tool with your project and branch IDs'
    );
    log.warning('This feature requires Neon MCP integration');
  }

  log.section('Migration Complete');
  log.success('Preview branch is up to date');
}

// Run migrations if this is the main module
if (require.main === module) {
  runNeonPreviewMigration().catch(error => {
    log.error(`Unexpected error: ${error}`);
    process.exit(1);
  });
}

export { runNeonPreviewMigration };
