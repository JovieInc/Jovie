/* eslint-disable @jovie/no-manual-db-pooling -- standalone script */

/**
 * Post-migration schema verification.
 *
 * Compares every column defined in the Drizzle schema against the actual
 * database via information_schema. If any columns are missing, exits with
 * code 1 so the CI deploy is blocked before broken code reaches production.
 *
 * This catches the case where a migration is recorded as applied in the
 * Drizzle journal (__drizzle_migrations) but the ALTER TABLE statements
 * never actually ran — e.g. due to a Neon branch reset or bootstrap mismatch.
 *
 * Usage:
 *   doppler run -- tsx scripts/drizzle-migrate-verify.ts
 *   # or in CI:
 *   pnpm --filter=@jovie/web exec tsx scripts/drizzle-migrate-verify.ts
 */

import { neonConfig, Pool } from '@neondatabase/serverless';
import { getTableColumns, getTableName, is } from 'drizzle-orm';
import { PgTable } from 'drizzle-orm/pg-core';
import ws from 'ws';

import * as schema from '../lib/db/schema';

neonConfig.webSocketConstructor = ws;

const colors = {
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  bright: '\x1b[1m',
  reset: '\x1b[0m',
};

interface DbColumn {
  table_name: string;
  column_name: string;
}

interface ExpectedColumn {
  table: string;
  column: string;
}

const MAX_VERIFY_ATTEMPTS = 5;
const RETRY_DELAY_MS = 2_000;

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

function groupByTable(mismatches: ExpectedColumn[]): Map<string, string[]> {
  const byTable = new Map<string, string[]>();
  for (const mismatch of mismatches) {
    if (!byTable.has(mismatch.table)) byTable.set(mismatch.table, []);
    byTable.get(mismatch.table)!.push(mismatch.column);
  }
  return byTable;
}

async function loadDbColumns(pool: Pool): Promise<Map<string, Set<string>>> {
  const dbResult = await pool.query<DbColumn>(`
    SELECT table_name, column_name
    FROM information_schema.columns
    WHERE table_schema = 'public'
    ORDER BY table_name, ordinal_position
  `);

  const dbColumns = new Map<string, Set<string>>();
  for (const row of dbResult.rows) {
    if (!dbColumns.has(row.table_name)) {
      dbColumns.set(row.table_name, new Set());
    }
    dbColumns.get(row.table_name)!.add(row.column_name);
  }

  return dbColumns;
}

function loadExpectedColumns(): {
  expectedColumns: ExpectedColumn[];
  tablesChecked: number;
  columnsChecked: number;
} {
  const expectedColumns: ExpectedColumn[] = [];
  let tablesChecked = 0;
  let columnsChecked = 0;

  for (const [_exportName, exported] of Object.entries(schema)) {
    if (!is(exported, PgTable)) continue;

    const tableName = getTableName(exported);
    const columns = getTableColumns(exported);
    tablesChecked++;

    for (const [_key, col] of Object.entries(columns)) {
      const dbColName = (col as unknown as { name: string }).name;
      expectedColumns.push({ table: tableName, column: dbColName });
      columnsChecked++;
    }
  }

  return { expectedColumns, tablesChecked, columnsChecked };
}

function findMismatches(
  expectedColumns: ExpectedColumn[],
  dbColumns: Map<string, Set<string>>
): ExpectedColumn[] {
  const mismatches: ExpectedColumn[] = [];

  for (const expected of expectedColumns) {
    const actualColumns = dbColumns.get(expected.table);
    if (!actualColumns || !actualColumns.has(expected.column)) {
      mismatches.push(expected);
    }
  }

  return mismatches;
}

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error(`${colors.red}ERROR: DATABASE_URL is not set${colors.reset}`);
    process.exit(1);
  }

  const pool = new Pool({ connectionString: databaseUrl });

  try {
    const { expectedColumns, tablesChecked, columnsChecked } =
      loadExpectedColumns();
    let mismatches: ExpectedColumn[] = [];

    for (let attempt = 1; attempt <= MAX_VERIFY_ATTEMPTS; attempt++) {
      const dbColumns = await loadDbColumns(pool);
      mismatches = findMismatches(expectedColumns, dbColumns);

      if (mismatches.length === 0) {
        break;
      }

      if (attempt < MAX_VERIFY_ATTEMPTS) {
        console.warn(
          `${colors.yellow}⚠${colors.reset} Schema mismatch on attempt ${attempt}/${MAX_VERIFY_ATTEMPTS} (${mismatches.length} missing columns). Retrying in ${RETRY_DELAY_MS / 1000}s...`
        );
        await sleep(RETRY_DELAY_MS);
      }
    }

    if (mismatches.length === 0) {
      console.log(
        `${colors.green}✓${colors.reset} Schema verification passed — ${columnsChecked} columns across ${tablesChecked} tables match the database`
      );
      process.exit(0);
    }

    // Group mismatches by table for readable output
    const byTable = groupByTable(mismatches);

    console.error(
      `\n${colors.red}${colors.bright}✗ Schema verification FAILED${colors.reset}`
    );
    console.error(
      `\n  ${mismatches.length} column(s) defined in the Drizzle schema are missing from the database:\n`
    );

    for (const [table, cols] of Array.from(byTable.entries())) {
      console.error(`  ${colors.bright}${table}${colors.reset}`);
      for (const col of cols) {
        console.error(`    ${colors.red}✗${colors.reset} ${col}`);
      }
    }

    console.error(
      `\n  This means a migration was recorded as applied but the DDL never executed.`
    );
    console.error(
      `  Fix: run the missing ALTER TABLE statements manually, or reset the Neon branch.\n`
    );

    process.exit(1);
  } finally {
    await pool.end();
  }
}

main().catch(err => {
  console.error('Unexpected error:', err);
  process.exit(1);
});
