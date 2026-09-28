#!/usr/bin/env npx tsx
/* eslint-disable @jovie/no-manual-db-pooling -- standalone script */
/**
 * Migration Drift Verification Script
 *
 * Compares the Drizzle migration journal
 * (drizzle/migrations/meta/_journal.json + per-file SHA-256 hashes, the same
 * hash drizzle-orm's migrator writes) against the database's
 * drizzle.__drizzle_migrations ledger. Fails loudly when they disagree —
 * `pnpm db:migrate` trusts the ledger and will report "up to date" even when
 * migrations were never applied, so this is the only early warning.
 *
 * Usage:
 *   pnpm run db:verify
 *   npx tsx scripts/verify-db-migrations.ts
 */

import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { neonConfig, Pool } from '@neondatabase/serverless';
import ws from 'ws';

neonConfig.webSocketConstructor = ws;

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const webRootDir = path.resolve(scriptDir, '..');
const migrationsDir = path.join(webRootDir, 'drizzle', 'migrations');

export interface JournalEntry {
  idx: number;
  tag: string;
  when: number;
}

export interface AppliedMigration {
  hash: string;
  created_at: number;
}

export interface MissingMigration {
  idx: number;
  tag: string;
  when: number;
  hash: string;
}

export interface DriftReport {
  ok: boolean;
  journalCount: number;
  ledgerCount: number;
  /** Journal entries whose file hash has no row in the ledger. */
  missing: MissingMigration[];
  /** Ledger rows whose hash matches no journal entry file. */
  unexpected: AppliedMigration[];
}

export function hashMigrationSql(sql: string): string {
  return createHash('sha256').update(sql).digest('hex');
}

export function computeMigrationDrift(
  journal: (JournalEntry & { hash: string })[],
  applied: AppliedMigration[]
): DriftReport {
  const appliedHashes = new Set(applied.map(row => row.hash));
  const journalHashes = new Set(journal.map(entry => entry.hash));

  const missing = journal.filter(entry => !appliedHashes.has(entry.hash));
  const unexpected = applied.filter(row => !journalHashes.has(row.hash));

  return {
    ok: missing.length === 0 && unexpected.length === 0,
    journalCount: journal.length,
    ledgerCount: applied.length,
    missing,
    unexpected,
  };
}

export interface LedgerRepairPlan {
  /** Ledger rows to delete (hash matches no journal file). */
  deleteRows: AppliedMigration[];
  /** Ledger rows to insert (file hash + journal `when`). */
  insertRows: { hash: string; created_at: number; tag: string }[];
}

export function planLedgerRepair(
  journal: (JournalEntry & { hash: string })[],
  report: DriftReport
): LedgerRepairPlan {
  return {
    deleteRows: report.unexpected,
    insertRows: report.missing.map(entry => ({
      hash: entry.hash,
      created_at: entry.when,
      tag: entry.tag,
    })),
  };
}

export function readJournalWithHashes(): (JournalEntry & {
  hash: string;
})[] {
  const journalPath = path.join(migrationsDir, 'meta', '_journal.json');
  const journal = JSON.parse(readFileSync(journalPath, 'utf8')) as {
    entries: JournalEntry[];
  };

  return journal.entries.map(entry => {
    const sql = readFileSync(
      path.join(migrationsDir, `${entry.tag}.sql`),
      'utf8'
    );
    return { ...entry, hash: hashMigrationSql(sql) };
  });
}

async function fetchAppliedMigrations(
  databaseUrl: string
): Promise<AppliedMigration[]> {
  const pool = new Pool({ connectionString: databaseUrl });
  try {
    const result = await pool.query<AppliedMigration>(
      'SELECT hash, created_at FROM drizzle.__drizzle_migrations ORDER BY created_at'
    );
    return result.rows;
  } finally {
    await pool.end();
  }
}

function printReport(report: DriftReport): void {
  console.log(
    `Journal entries: ${report.journalCount} | ledger rows: ${report.ledgerCount}`
  );

  if (report.ok) {
    console.log(
      '✓ Migration ledger matches the drizzle journal — no drift detected'
    );
    return;
  }

  console.error('✗ Migration drift detected:');
  for (const entry of report.missing) {
    console.error(
      `  MISSING from database: ${entry.tag} (idx ${entry.idx}, hash ${entry.hash.slice(0, 12)}…)`
    );
  }
  for (const row of report.unexpected) {
    console.error(
      `  NOT IN JOURNAL: hash ${row.hash.slice(0, 12)}… (created_at ${row.created_at})`
    );
  }
  console.error('');
  console.error(
    'The drizzle migrator trusts the ledger and will report "up to date"'
  );
  console.error('even though these migrations never ran. To repair:');
  console.error(
    '  1. Apply each missing apps/web/drizzle/migrations/<tag>.sql manually'
  );
  console.error(
    '     (they are written idempotently: IF NOT EXISTS / guarded DO blocks).'
  );
  console.error(
    '  2. Insert the file SHA-256 into drizzle.__drizzle_migrations with the'
  );
  console.error('     journal `when` timestamp as created_at.');
  console.error('  3. Re-run `pnpm run db:verify` until it passes.');
}

/**
 * Reconcile an ephemeral certification branch ledger with the repo journal.
 * The certification lane snapshots the shared parent branch, whose ledger can
 * drift from the journal (mutated file hashes, lost rows) even though the
 * schema is the real prior-release state. Drift is reported loudly before
 * repair; this only rewrites drizzle.__drizzle_migrations bookkeeping — it
 * never touches schema and must never run against a shared database.
 */
async function repairLedger(
  databaseUrl: string,
  journal: (JournalEntry & { hash: string })[],
  report: DriftReport
): Promise<void> {
  const plan = planLedgerRepair(journal, report);
  const pool = new Pool({ connectionString: databaseUrl });
  try {
    for (const row of plan.deleteRows) {
      await pool.query(
        'DELETE FROM drizzle.__drizzle_migrations WHERE hash = $1',
        [row.hash]
      );
    }
    for (const row of plan.insertRows) {
      await pool.query(
        'INSERT INTO drizzle.__drizzle_migrations (hash, created_at) VALUES ($1, $2)',
        [row.hash, row.created_at]
      );
      console.log(
        `  reconciled ledger row: ${row.tag} (hash ${row.hash.slice(0, 12)}…)`
      );
    }
  } finally {
    await pool.end();
  }
}

async function main(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error('✗ DATABASE_URL environment variable is not set');
    process.exit(1);
  }

  const repair = process.argv.includes('--repair-ephemeral-ledger');
  const journal = readJournalWithHashes();
  const applied = await fetchAppliedMigrations(databaseUrl);
  const report = computeMigrationDrift(journal, applied);
  printReport(report);

  if (!report.ok) {
    if (!repair) {
      process.exit(1);
    }
    console.log(
      '↻ Reconciling the ephemeral ledger to the journal (certification branch only)'
    );
    await repairLedger(databaseUrl, journal, report);
    const recheck = computeMigrationDrift(
      journal,
      await fetchAppliedMigrations(databaseUrl)
    );
    printReport(recheck);
    if (!recheck.ok) {
      process.exit(1);
    }
  }
}

const isDirectRun =
  process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isDirectRun) {
  main().catch(error => {
    console.error('✗ Migration verification failed to run:', error);
    process.exit(1);
  });
}
