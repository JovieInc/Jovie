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

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error(`${colors.red}ERROR: DATABASE_URL is not set${colors.reset}`);
    process.exit(1);
  }

  const pool = new Pool({ connectionString: databaseUrl });

  try {
    // 1. Get all columns from the actual database
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

    // 2. Extract expected columns from Drizzle schema
    const mismatches: Array<{ table: string; column: string }> = [];
    let tablesChecked = 0;
    let columnsChecked = 0;

    for (const [_exportName, exported] of Object.entries(schema)) {
      if (!is(exported, PgTable)) continue;

      const tableName = getTableName(exported);
      const columns = getTableColumns(exported);
      tablesChecked++;

      const actualColumns = dbColumns.get(tableName);
      if (!actualColumns) {
        // Entire table missing — report all columns
        for (const [_key, col] of Object.entries(columns)) {
          const dbColName = (col as unknown as { name: string }).name;
          mismatches.push({ table: tableName, column: dbColName });
          columnsChecked++;
        }
        continue;
      }

      for (const [_key, col] of Object.entries(columns)) {
        const dbColName = (col as unknown as { name: string }).name;
        columnsChecked++;

        if (!actualColumns.has(dbColName)) {
          mismatches.push({ table: tableName, column: dbColName });
        }
      }
    }

    // 3. Report results
    if (mismatches.length === 0) {
      console.log(
        `${colors.green}✓${colors.reset} Schema verification passed — ${columnsChecked} columns across ${tablesChecked} tables match the database`
      );
      process.exit(0);
    }

    // Group mismatches by table for readable output
    const byTable = new Map<string, string[]>();
    for (const m of mismatches) {
      if (!byTable.has(m.table)) byTable.set(m.table, []);
      byTable.get(m.table)!.push(m.column);
    }

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
