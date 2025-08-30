#!/usr/bin/env node

/**
 * Drizzle Migration Script with Branch Protection and Neon Support
 *
 * This script handles database migrations safely across different environments.
 * - Supports preview and production branches
 * - Includes safety checks for production migrations
 * - Compatible with Neon database connections
 * - Handles environment variable validation
 */

import { execSync } from 'child_process';
import { config } from 'dotenv';
import { sql as drizzleSql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import { existsSync, readFileSync } from 'fs';
import path from 'path';
import postgres from 'postgres';
import * as readline from 'readline';

// Load environment variables: prefer .env.local, then fallback to .env
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

// Get current git branch
function getCurrentBranch(): string {
  try {
    const branch = execSync('git rev-parse --abbrev-ref HEAD', {
      encoding: 'utf8',
    }).trim();
    return branch;
  } catch {
    return 'unknown';
  }
}

// Get environment from GIT_BRANCH env variable or current git branch
function getEnvironment(): 'preview' | 'production' | 'development' {
  const envBranch = process.env.GIT_BRANCH;
  const gitBranch = getCurrentBranch();
  const branch = envBranch || gitBranch;

  if (branch === 'production' || branch === 'main') {
    return 'production';
  } else if (branch === 'preview') {
    return 'preview';
  } else {
    return 'development';
  }
}

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

// Production safety check
async function confirmProductionMigration(): Promise<boolean> {
  const env = getEnvironment();

  if (env !== 'production') {
    return true;
  }

  log.warning('⚠️  PRODUCTION MIGRATION DETECTED ⚠️');
  console.log('');
  console.log('You are about to run migrations on the PRODUCTION database.');
  console.log('This action is irreversible and may affect live users.');
  console.log('');
  console.log('Before proceeding:');
  console.log('  1. Ensure you have a recent database backup');
  console.log('  2. Review all pending migrations carefully');
  console.log('  3. Consider testing on preview environment first');
  console.log('  4. Have a rollback plan ready');
  console.log('');

  // Check for ALLOW_PROD_MIGRATIONS flag (CI/CD usage)
  if (process.env.ALLOW_PROD_MIGRATIONS === 'true') {
    log.info(
      'ALLOW_PROD_MIGRATIONS flag detected, proceeding with production migration'
    );
    return true;
  }

  // In CI environment, fail if flag not set
  if (process.env.CI === 'true') {
    log.error(
      'Production migrations blocked in CI. Set ALLOW_PROD_MIGRATIONS=true to proceed.'
    );
    return false;
  }

  // Interactive confirmation for local runs
  if (process.stdout.isTTY) {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    return new Promise(resolve => {
      rl.question(
        'Type "MIGRATE PRODUCTION" to confirm: ',
        (answer: string) => {
          rl.close();
          resolve(answer === 'MIGRATE PRODUCTION');
        }
      );
    });
  }

  // Non-interactive environment without flag
  log.error(
    'Cannot run production migrations in non-interactive mode without ALLOW_PROD_MIGRATIONS=true'
  );
  return false;
}

// Main migration function
async function runMigrations() {
  log.section('Drizzle Database Migration');

  // Validate environment
  const { isValid, errors } = validateEnvironment();
  if (!isValid) {
    log.error('Environment validation failed:');
    errors.forEach(err => log.error(`  - ${err}`));
    process.exit(1);
  }

  // Get environment info
  const env = getEnvironment();
  const branch = process.env.GIT_BRANCH || getCurrentBranch();

  log.info(`Environment: ${colors.bright}${env}${colors.reset}`);
  log.info(`Branch: ${colors.bright}${branch}${colors.reset}`);
  log.info(`Database: ${colors.bright}[REDACTED]${colors.reset}`);

  // Check if migrations exist
  if (!checkMigrationsExist()) {
    log.warning('No migrations found in drizzle/migrations directory');
    log.info(
      'Run "npm run drizzle:generate" to generate migrations from schema'
    );
    process.exit(0);
  }

  // Production safety check
  if (!(await confirmProductionMigration())) {
    log.error('Migration cancelled by user');
    process.exit(1);
  }

  // Connect to database
  let sql: postgres.Sql;
  let db: ReturnType<typeof drizzle>;

  try {
    log.info('Connecting to database...');

    // Clean the URL for Neon (remove the +neon suffix correctly, preserving 'postgres' or 'postgresql')
    const rawUrl = process.env.DATABASE_URL!;
    const databaseUrl = rawUrl.replace(NEON_URL_PATTERN, 'postgres$2$4');

    sql = postgres(databaseUrl, {
      ssl: true,
      max: 1,
      onnotice: () => {}, // Suppress notices
    });

    db = drizzle(sql);

    // Using default public schema

    log.success('Database connection established');
  } catch (error) {
    log.error(`Failed to connect to database: ${error}`);
    process.exit(1);
  }

  // Run migrations
  try {
    log.info('Running migrations...');

    const start = Date.now();
    await migrate(db, {
      migrationsFolder: './drizzle/migrations',
      migrationsTable: '__drizzle_migrations',
    });
    const duration = ((Date.now() - start) / 1000).toFixed(2);

    log.success(`Migrations completed successfully in ${duration}s`);
  } catch (error) {
    log.error(`Migration failed: ${error}`);
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

  log.section('Migration Complete');
}

// Run migrations if this is the main module
if (require.main === module) {
  runMigrations().catch(error => {
    log.error(`Unexpected error: ${error}`);
    process.exit(1);
  });
}

export { runMigrations };
