#!/usr/bin/env node
/* eslint-disable @jovie/no-manual-db-pooling -- standalone script */

/**
 * Drizzle Migration Script with Branch Protection and Neon Support
 *
 * This script handles database migrations safely across different environments.
 * - Supports preview and production branches
 * - Includes safety checks for production migrations
 * - Compatible with Neon database connections
 * - Handles environment variable validation
 */

import { fileURLToPath } from 'node:url';
import { neonConfig, Pool, type PoolClient } from '@neondatabase/serverless';
import { execSync } from 'child_process';
import { config } from 'dotenv';
import { drizzle } from 'drizzle-orm/neon-serverless';
import { migrate } from 'drizzle-orm/neon-serverless/migrator';
import { existsSync, readFileSync } from 'fs';
import path from 'path';
import * as readline from 'readline';
import ws from 'ws';

// Load environment variables: prefer .env.local, then fallback to .env
// Do not override values already provided by the environment (e.g. Doppler).
config({ path: '.env.local', override: false });
config({ override: false });

// Configure WebSocket for Node.js environment (required for Neon serverless driver)
neonConfig.webSocketConstructor = ws;

// Neon URL pattern for cleaning database URLs
const NEON_URL_PATTERN = /(postgres)(|ql)(\+neon)(.*)/;
const CI_CONNECT_RETRY_LIMIT = 12;
const CI_CONNECT_RETRY_DELAY_MS = 5_000;
const CONNECT_BOOTSTRAP_TIMEOUT_MS = 15_000;

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const webRootDir = path.resolve(scriptDir, '..');
const migrationsDir = path.join(webRootDir, 'drizzle', 'migrations');

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
function getEnvironment(): 'main' | 'production' | 'development' {
  const envBranch = process.env.GIT_BRANCH;
  const gitBranch = getCurrentBranch();
  const branch = envBranch || gitBranch;

  // Treat both 'main' and 'production' as production in trunk-based development
  if (branch === 'main' || branch === 'production') {
    return 'production';
  }
  return 'development';
}

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function extractErrorCode(error: unknown) {
  if (!error || typeof error !== 'object') {
    return undefined;
  }

  const directCode =
    'code' in error && typeof error.code === 'string' ? error.code : undefined;
  if (directCode) {
    return directCode;
  }

  const cause =
    'cause' in error && error.cause && typeof error.cause === 'object'
      ? error.cause
      : undefined;

  return cause && 'code' in cause && typeof cause.code === 'string'
    ? cause.code
    : undefined;
}

function flattenErrorMessages(error: unknown): string[] {
  if (!error || typeof error !== 'object') {
    return [String(error)];
  }

  const messages: string[] = [];
  const directMessage =
    'message' in error && typeof error.message === 'string'
      ? error.message
      : undefined;
  if (directMessage) {
    messages.push(directMessage);
  }

  const cause =
    'cause' in error && error.cause && typeof error.cause === 'object'
      ? error.cause
      : undefined;
  const causeMessage =
    cause && 'message' in cause && typeof cause.message === 'string'
      ? cause.message
      : undefined;
  if (causeMessage) {
    messages.push(causeMessage);
  }

  if (messages.length === 0) {
    messages.push(String(error));
  }

  return messages;
}

function isRetryableConnectionError(error: unknown) {
  const code = extractErrorCode(error);
  if (code === 'XX000' || code === '57P03' || code === 'ECONNRESET') {
    return true;
  }

  const combinedMessage = flattenErrorMessages(error).join(' ').toLowerCase();
  return (
    combinedMessage.includes('requested endpoint could not be found') ||
    combinedMessage.includes("you don't have access to it") ||
    combinedMessage.includes('connection terminated unexpectedly') ||
    combinedMessage.includes('timed out waiting for database connection') ||
    combinedMessage.includes('fetch failed')
  );
}

async function connectClientWithRetryableBootstrap(pool: Pool) {
  return await new Promise<PoolClient>((resolve, reject) => {
    let settled = false;
    const timeout = setTimeout(() => {
      rejectOnce(new Error('Timed out waiting for database connection.'));
    }, CONNECT_BOOTSTRAP_TIMEOUT_MS);

    const rejectOnce = (error: unknown) => {
      if (settled) {
        return;
      }

      settled = true;
      clearTimeout(timeout);
      reject(error);
    };

    const resolveOnce = (client: PoolClient) => {
      if (settled) {
        void client.release();
        return;
      }

      settled = true;
      clearTimeout(timeout);
      resolve(client);
    };

    void pool.connect().then(resolveOnce).catch(rejectOnce);
  });
}

async function connectWithRetry(databaseUrl: string) {
  const maxAttempts = process.env.CI === 'true' ? CI_CONNECT_RETRY_LIMIT : 1;
  let lastError: unknown;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    let pool: Pool | null = null;
    let client: PoolClient | null = null;

    try {
      pool = new Pool({ connectionString: databaseUrl, max: 1 });
      pool.on('error', error => {
        if (isRetryableConnectionError(error)) {
          log.warning(
            `Ignoring transient Neon pool error during migrate bootstrap: ${flattenErrorMessages(error).join(' ')}`
          );
          return;
        }

        log.error(
          `Unexpected Neon pool error during migrate bootstrap: ${flattenErrorMessages(error).join(' ')}`
        );
      });
      client = await connectClientWithRetryableBootstrap(pool);
      client.on('error', error => {
        if (isRetryableConnectionError(error)) {
          log.warning(
            `Ignoring transient Neon client error during migrate bootstrap: ${flattenErrorMessages(error).join(' ')}`
          );
          return;
        }

        log.error(
          `Unexpected Neon client error during migrate bootstrap: ${flattenErrorMessages(error).join(' ')}`
        );
      });
      await client.query("SET app.allow_schema_changes = 'true'");
      const db = drizzle(client);

      return { client, db, pool };
    } catch (error) {
      lastError = error;
      try {
        client?.release();
      } catch {
        // Ignore release errors during retry cleanup.
      }
      try {
        await pool?.end();
      } catch {
        // Ignore cleanup errors between retries.
      }

      if (!isRetryableConnectionError(error) || attempt === maxAttempts) {
        throw error;
      }

      log.warning(
        `Database connection attempt ${attempt}/${maxAttempts} failed with a transient Neon endpoint error. Retrying in ${CI_CONNECT_RETRY_DELAY_MS / 1000}s...`
      );
      await sleep(CI_CONNECT_RETRY_DELAY_MS);
    }
  }

  throw lastError;
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
  if (!existsSync(migrationsDir)) {
    return false;
  }

  try {
    const journalPath = path.join(migrationsDir, 'meta', '_journal.json');
    if (existsSync(journalPath)) {
      const journal = JSON.parse(readFileSync(journalPath, 'utf8'));
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
  console.log('  3. Consider testing on main/staging environment first');
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
      'Run "pnpm run drizzle:generate" to generate migrations from schema'
    );
    process.exit(0);
  }

  // Production safety check
  if (!(await confirmProductionMigration())) {
    log.error('Migration cancelled by user');
    process.exit(1);
  }

  // Connect to database
  let pool: Pool;
  let db: Parameters<typeof migrate>[0];
  let client: PoolClient | null = null;

  try {
    log.info('Connecting to database...');

    // Clean the URL for Neon (remove the +neon suffix correctly, preserving 'postgres' or 'postgresql')
    const rawUrl = process.env.DATABASE_URL!;
    const databaseUrl = rawUrl.replace(NEON_URL_PATTERN, 'postgres$2$4');
    const connection = await connectWithRetry(databaseUrl);
    pool = connection.pool;
    client = connection.client;
    db = connection.db;

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
      migrationsFolder: migrationsDir,
      migrationsSchema: 'drizzle',
      migrationsTable: '__drizzle_migrations',
    });
    const duration = ((Date.now() - start) / 1000).toFixed(2);

    log.success(`Migrations completed successfully in ${duration}s`);
  } catch (error) {
    const err = error as unknown;
    const details = (() => {
      if (!err || typeof err !== 'object') return undefined;
      const e = err as Record<string, unknown>;
      const code = typeof e.code === 'string' ? e.code : undefined;
      const detail = typeof e.detail === 'string' ? e.detail : undefined;
      const hint = typeof e.hint === 'string' ? e.hint : undefined;
      const where = typeof e.where === 'string' ? e.where : undefined;
      const schema = typeof e.schema === 'string' ? e.schema : undefined;
      const table = typeof e.table === 'string' ? e.table : undefined;
      const constraint =
        typeof e.constraint === 'string' ? e.constraint : undefined;

      if (
        !code &&
        !detail &&
        !hint &&
        !where &&
        !schema &&
        !table &&
        !constraint
      ) {
        return undefined;
      }

      return { code, detail, hint, where, schema, table, constraint };
    })();

    const message = err instanceof Error ? err.message : String(err);
    log.error(`Migration failed: ${message}`);

    console.error(err);

    const postgresCause = (() => {
      if (!err || typeof err !== 'object') return undefined;
      const e = err as Record<string, unknown>;
      const cause = e.cause;
      if (!cause || typeof cause !== 'object') return undefined;
      const c = cause as Record<string, unknown>;
      const code = typeof c.code === 'string' ? c.code : undefined;
      const causeMessage =
        typeof c.message === 'string' ? c.message : undefined;
      return { code, causeMessage };
    })();

    const postgresCode = details?.code ?? postgresCause?.code;
    const postgresMessage = postgresCause?.causeMessage;
    if (
      postgresCode === '42701' ||
      (postgresMessage && postgresMessage.includes('already exists'))
    ) {
      log.warning(
        'Detected migration-history drift: the database schema already contains a change that a migration is trying to re-apply.'
      );
      log.info(
        'Recommended fix (cleanest): point DATABASE_URL at a fresh Neon branch reset from main, then rerun pnpm drizzle:migrate.'
      );
      log.info(
        'Alternative (dev only): mark the conflicting migration as applied in drizzle.__drizzle_migrations (no migration file edits).'
      );
      log.info(
        'Hint: Check if the schema already contains the change being applied.'
      );
    }

    if (details) {
      log.error(`Postgres details: ${JSON.stringify(details)}`);
    }
    process.exit(1);
  } finally {
    try {
      client?.release();
    } catch {
      // ignore
    }

    // Close database connection
    try {
      await pool.end();
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
