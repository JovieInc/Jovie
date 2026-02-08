#!/usr/bin/env node
/* eslint-disable @jovie/no-manual-db-pooling -- standalone script */

/**
 * Drizzle migration preflight for main/production deployments.
 *
 * - Validates environment safety.
 * - Verifies migration list integrity.
 * - Logs the migrations that will run.
 */

import { neonConfig, Pool } from '@neondatabase/serverless';
import { config } from 'dotenv';
import { existsSync, readdirSync, readFileSync } from 'fs';
import path from 'path';
import ws from 'ws';

config({ path: '.env.local', override: true });
config();

neonConfig.webSocketConstructor = ws;

type DrizzleMigrationsSchema = 'drizzle' | 'public';

type JournalEntry = {
  idx: number;
  tag: string;
  when: number;
  breakpoints: boolean;
  version?: string;
};

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

function validateEnvironment(): void {
  const errors: string[] = [];

  if (!process.env.DATABASE_URL) {
    errors.push('Missing required environment variable: DATABASE_URL');
  } else if (
    !process.env.DATABASE_URL.startsWith('postgres://') &&
    !process.env.DATABASE_URL.startsWith('postgresql://')
  ) {
    errors.push('DATABASE_URL must be a valid PostgreSQL connection string');
  }

  const branch = process.env.GIT_BRANCH;
  if (!branch) {
    errors.push('Missing required environment variable: GIT_BRANCH');
  } else if (branch !== 'main') {
    errors.push(
      `Unsupported GIT_BRANCH "${branch}". Preflight only runs on main branch.`
    );
  }

  // Main branch deploys to production in trunk-based development
  if (branch === 'main' && process.env.ALLOW_PROD_MIGRATIONS !== 'true') {
    errors.push(
      'ALLOW_PROD_MIGRATIONS=true is required for production migrations on main branch.'
    );
  }

  if (errors.length > 0) {
    log.error('Environment validation failed:');
    errors.forEach(err => log.error(`  - ${err}`));
    process.exit(1);
  }
}

function loadJournalEntries(): JournalEntry[] {
  const metaPath = path.join(
    process.cwd(),
    'drizzle',
    'migrations',
    'meta',
    '_journal.json'
  );

  if (!existsSync(metaPath)) {
    log.error(
      'Migration journal not found: drizzle/migrations/meta/_journal.json'
    );
    process.exit(1);
  }

  const journal = JSON.parse(readFileSync(metaPath, 'utf8')) as {
    entries?: JournalEntry[];
  };

  if (!journal.entries || journal.entries.length === 0) {
    log.warning('No migration entries found in the journal.');
    return [];
  }

  return [...journal.entries].sort((a, b) => a.idx - b.idx);
}

function validateMigrationList(entries: JournalEntry[]): void {
  const migrationsDir = path.join(process.cwd(), 'drizzle', 'migrations');
  if (!existsSync(migrationsDir)) {
    log.error('Migration directory not found: drizzle/migrations');
    process.exit(1);
  }

  const sqlFiles = readdirSync(migrationsDir).filter(
    file => file.endsWith('.sql') && file !== 'meta'
  );

  const tagsFromFiles = new Set(
    sqlFiles.map(file => file.replace(/\.sql$/, ''))
  );
  const tagsFromJournal = new Set(entries.map(entry => entry.tag));

  const unregistered = [...tagsFromFiles].filter(
    tag => !tagsFromJournal.has(tag)
  );
  if (unregistered.length > 0) {
    log.error('Unregistered migration files detected:');
    unregistered.forEach(tag => log.error(`  - ${tag}.sql`));
    process.exit(1);
  }

  const missingFiles = entries
    .map(entry => entry.tag)
    .filter(tag => !tagsFromFiles.has(tag));

  if (missingFiles.length > 0) {
    log.error('Journal entries missing migration files:');
    missingFiles.forEach(tag => log.error(`  - ${tag}.sql`));
    process.exit(1);
  }
}

async function resolveMigrationsSchemaSafely(
  pool: Pool
): Promise<{ schema: DrizzleMigrationsSchema; tableExists: boolean }> {
  try {
    const [{ drizzle_table, public_table }] = (
      await pool.query<{
        drizzle_table: string | null;
        public_table: string | null;
      }>(
        "SELECT to_regclass('drizzle.__drizzle_migrations')::text AS drizzle_table, to_regclass('public.__drizzle_migrations')::text AS public_table"
      )
    ).rows;

    if (drizzle_table) {
      return { schema: 'drizzle', tableExists: true };
    }
    if (public_table) {
      return { schema: 'public', tableExists: true };
    }

    const [{ schema_exists, has_schema_create, has_db_create }] = (
      await pool.query<{
        schema_exists: boolean;
        has_schema_create: boolean;
        has_db_create: boolean;
      }>(
        "SELECT EXISTS (SELECT 1 FROM information_schema.schemata WHERE schema_name = 'drizzle') AS schema_exists, has_schema_privilege(current_user, 'drizzle', 'CREATE') AS has_schema_create, has_database_privilege(current_user, current_database(), 'CREATE') AS has_db_create"
      )
    ).rows;

    if (schema_exists && has_schema_create) {
      return { schema: 'drizzle', tableExists: false };
    }
    if (has_db_create) {
      return { schema: 'drizzle', tableExists: false };
    }

    return { schema: 'public', tableExists: false };
  } catch {
    return { schema: 'drizzle', tableExists: false };
  }
}

async function loadAppliedCount(
  pool: Pool,
  schema: DrizzleMigrationsSchema,
  tableExists: boolean
): Promise<number> {
  if (!tableExists) {
    return 0;
  }

  const result = await pool.query<{ count: string }>(
    `SELECT COUNT(*)::text AS count FROM ${schema}.__drizzle_migrations`
  );
  return Number.parseInt(result.rows[0]?.count ?? '0', 10);
}

async function runPreflight(): Promise<void> {
  log.section('DB Safety Check (Preflight)');

  validateEnvironment();

  const branch = process.env.GIT_BRANCH!;
  log.info(`Environment: ${colors.bright}${branch}${colors.reset}`);
  log.info(`Database: ${colors.bright}[REDACTED]${colors.reset}`);

  const entries = loadJournalEntries();
  validateMigrationList(entries);

  if (entries.length === 0) {
    log.success('No migrations found. Nothing to apply.');
    return;
  }

  const pool = new Pool({ connectionString: process.env.DATABASE_URL! });

  pool.on('connect', (client: unknown) => {
    (client as { query: (sql: string) => Promise<unknown> })
      .query("SET app.allow_schema_changes = 'true'")
      .catch(() => undefined);
  });

  try {
    const { schema, tableExists } = await resolveMigrationsSchemaSafely(pool);
    const appliedCount = await loadAppliedCount(pool, schema, tableExists);

    log.info(`Migrations schema: ${colors.bright}${schema}${colors.reset}`);
    log.info(
      `Applied migrations: ${colors.bright}${appliedCount}${colors.reset}`
    );
    log.info(
      `Migrations in journal: ${colors.bright}${entries.length}${colors.reset}`
    );

    if (appliedCount > entries.length) {
      log.warning(
        'Applied migration count exceeds the journal length. Review migration history before proceeding.'
      );
    }

    const pending =
      appliedCount >= entries.length ? [] : entries.slice(appliedCount);

    if (pending.length === 0) {
      log.success('No pending migrations detected.');
      return;
    }

    log.warning(
      `Pending migrations to apply: ${colors.bright}${pending.length}${colors.reset}`
    );
    pending.forEach(entry => {
      console.log(`  • ${entry.tag}`);
    });
  } finally {
    await pool.end();
  }

  log.section('Preflight Complete');
}

if (require.main === module) {
  runPreflight().catch(error => {
    log.error(`Unexpected error: ${error}`);
    process.exit(1);
  });
}
