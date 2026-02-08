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

import crypto from 'node:crypto';
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

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const webRootDir = path.resolve(scriptDir, '..');
const migrationsDir = path.join(webRootDir, 'drizzle', 'migrations');
const migrationsJournalPath = path.join(migrationsDir, 'meta', '_journal.json');

type DrizzleMigrationsSchema = 'drizzle' | 'public';
type JournalEntry = { idx: number; tag: string; when: number };

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
    if (existsSync(migrationsJournalPath)) {
      const journal = JSON.parse(readFileSync(migrationsJournalPath, 'utf8'));
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
  let migrationsSchema: DrizzleMigrationsSchema = 'drizzle';

  try {
    log.info('Connecting to database...');

    // Clean the URL for Neon (remove the +neon suffix correctly, preserving 'postgres' or 'postgresql')
    const rawUrl = process.env.DATABASE_URL!;
    const databaseUrl = rawUrl.replace(NEON_URL_PATTERN, 'postgres$2$4');

    pool = new Pool({ connectionString: databaseUrl, max: 1 });

    client = await pool.connect();
    await client.query("SET app.allow_schema_changes = 'true'");

    db = drizzle(client);

    // Using default public schema

    log.success('Database connection established');
  } catch (error) {
    log.error(`Failed to connect to database: ${error}`);
    process.exit(1);
  }

  async function resolveMigrationsSchemaSafely(): Promise<DrizzleMigrationsSchema> {
    try {
      const [{ drizzle_table, public_table }] = (
        await (client ?? pool).query<{
          drizzle_table: string | null;
          public_table: string | null;
        }>(
          "SELECT to_regclass('drizzle.__drizzle_migrations')::text AS drizzle_table, to_regclass('public.__drizzle_migrations')::text AS public_table"
        )
      ).rows;

      if (drizzle_table) return 'drizzle';
      if (public_table) return 'public';

      return 'drizzle';
    } catch {
      return 'drizzle';
    }
  }

  async function detectAppliedThroughIdx(): Promise<number | null> {
    type Probe = {
      idx: number | null;
      tag: string;
      existsQuery: string;
    };

    const journal = JSON.parse(readFileSync(migrationsJournalPath, 'utf8')) as {
      entries?: JournalEntry[];
    };

    const byTag = new Map(
      (journal.entries ?? []).map(entry => [entry.tag, entry] as const)
    );

    const idxFor = (tag: string): number | null => byTag.get(tag)?.idx ?? null;

    const schemaExistsResult = await (client ?? pool).query<{
      has_schema: boolean;
    }>(
      "SELECT (to_regclass('public.users') IS NOT NULL OR to_regtype('public.creator_type') IS NOT NULL) AS has_schema"
    );
    const hasSchema = Boolean(schemaExistsResult.rows[0]?.has_schema);
    if (!hasSchema) return null;

    // Probes detect schema artifacts to determine which migrations have been applied
    // when the migration history table is missing. Sorted by idx descending so we
    // return the highest applied migration index.
    const probes: Probe[] = [
      {
        tag: '0000_sleepy_ted_forrester',
        idx: idxFor('0000_sleepy_ted_forrester'),
        existsQuery:
          "SELECT (to_regclass('public.users') IS NOT NULL AND to_regclass('public.creator_profiles') IS NOT NULL) AS ok",
      },
    ]
      .filter((probe): probe is Probe & { idx: number } => probe.idx !== null)
      .sort((a, b) => b.idx - a.idx);

    for (const probe of probes) {
      const result = await (client ?? pool).query<{ ok: boolean }>(
        probe.existsQuery
      );
      const ok = Boolean(result.rows[0]?.ok);
      if (ok) return probe.idx;
    }

    return null;
  }

  async function bootstrapMigrationHistoryIfNeeded(): Promise<void> {
    const existing = await (client ?? pool).query<{
      drizzle_table: string | null;
      public_table: string | null;
    }>(
      "SELECT to_regclass('drizzle.__drizzle_migrations')::text AS drizzle_table, to_regclass('public.__drizzle_migrations')::text AS public_table"
    );

    if (existing.rows[0]?.drizzle_table || existing.rows[0]?.public_table) {
      return;
    }

    const appliedThroughIdx = await detectAppliedThroughIdx();
    if (appliedThroughIdx === null) {
      return;
    }

    await (client ?? pool).query('CREATE SCHEMA IF NOT EXISTS drizzle');
    await (client ?? pool).query(
      'CREATE TABLE IF NOT EXISTS drizzle.__drizzle_migrations (id SERIAL PRIMARY KEY, hash text NOT NULL, created_at numeric)'
    );

    const countResult = await (client ?? pool).query<{ count: string }>(
      'SELECT COUNT(*)::text AS count FROM drizzle.__drizzle_migrations'
    );
    const existingCount = Number.parseInt(
      countResult.rows[0]?.count ?? '0',
      10
    );
    if (existingCount > 0) {
      return;
    }

    const journal = JSON.parse(readFileSync(migrationsJournalPath, 'utf8')) as {
      entries?: JournalEntry[];
    };

    const entries = (journal.entries ?? [])
      .filter(entry => entry.idx <= appliedThroughIdx)
      .sort((a, b) => a.idx - b.idx);

    if (entries.length === 0) {
      return;
    }

    log.warning(
      `Detected schema without migration history. Bootstrapping drizzle.__drizzle_migrations with ${entries.length} entries...`
    );

    for (const entry of entries) {
      const migrationPath = path.join(migrationsDir, `${entry.tag}.sql`);

      const sqlText = readFileSync(migrationPath, 'utf8');
      const hash = crypto.createHash('sha256').update(sqlText).digest('hex');

      await (client ?? pool).query(
        'INSERT INTO drizzle.__drizzle_migrations (hash, created_at) VALUES ($1, $2)',
        [hash, entry.when]
      );
    }

    log.success('Bootstrapped drizzle migration history');
  }

  // Run migrations
  try {
    log.info('Running migrations...');

    migrationsSchema = await resolveMigrationsSchemaSafely();
    await bootstrapMigrationHistoryIfNeeded();
    log.info(
      `Migrations schema: ${colors.bright}${migrationsSchema}${colors.reset}`
    );

    const start = Date.now();
    await migrate(db, {
      migrationsFolder: migrationsDir,
      migrationsSchema,
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
