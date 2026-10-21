import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { getTableColumns, getTableName, is, SQL } from 'drizzle-orm';
import {
  getTableConfig,
  type PgColumn,
  PgDialect,
  PgTable,
} from 'drizzle-orm/pg-core';
import { describe, expect, it } from 'vitest';
import * as financeSchema from '@/lib/db/schema/finance';
import {
  financeAccounts,
  financeAnomalies,
  financeBalanceSnapshots,
  financeBudgetSettings,
  financeBudgetTargets,
  financeClassificationRules,
  financeExports,
  financeInstitutions,
  financeLedgerEvents,
  financeSyncStates,
  financeTransactionClassifications,
  financeTransactionSplits,
  financeTransactions,
} from '@/lib/db/schema/finance';

const FINANCE_TABLES = [
  financeInstitutions,
  financeAccounts,
  financeTransactions,
  financeExports,
  financeBudgetTargets,
  financeBudgetSettings,
];

const LEDGER_TABLES = [
  financeSyncStates,
  financeBalanceSnapshots,
  financeLedgerEvents,
  financeAnomalies,
];

const MIGRATION_PATHS = [
  path.join(process.cwd(), 'drizzle/migrations/0110_fancy_wolverine.sql'),
  path.join(process.cwd(), 'drizzle/migrations/0127_finance_budgets.sql'),
];

const LEDGER_MIGRATION_PATH = path.join(
  process.cwd(),
  'drizzle/migrations/0130_tearful_korath.sql'
);

const CLASSIFICATION_TABLES = [
  financeClassificationRules,
  financeTransactionClassifications,
  financeTransactionSplits,
];

const CLASSIFICATION_MIGRATION_PATH = path.join(
  process.cwd(),
  'drizzle/migrations/0128_finance_classification.sql'
);

const ALL_TABLES = (Object.values(financeSchema) as unknown[]).filter(
  (value): value is PgTable => is(value, PgTable)
);

const MIGRATIONS_DIR = path.join(process.cwd(), 'drizzle/migrations');
const ALL_MIGRATIONS_SQL = readdirSync(MIGRATIONS_DIR)
  .filter(file => file.endsWith('.sql'))
  .sort()
  .map(file => readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8'))
  .join('\n');

const dialect = new PgDialect();

/** The DDL fragment drizzle-kit emits for a column definition. */
function columnDdl(column: PgColumn): string {
  let ddl = `"${column.name}" ${column.getSQLType()}`;
  if (column.primary) ddl += ' PRIMARY KEY';
  if (column.hasDefault) {
    const value = column.default;
    const rendered = is(value, SQL)
      ? dialect.sqlToQuery(value).sql
      : typeof value === 'string'
        ? `'${value}'`
        : String(value);
    ddl += ` DEFAULT ${rendered}`;
  }
  if (column.notNull) ddl += ' NOT NULL';
  return ddl;
}

const quoteList = (names: readonly string[]) =>
  names.map(name => `"${name}"`).join(', ');

describe('finance schema owner boundary (JOV-4609)', () => {
  it.each(FINANCE_TABLES.map(t => [getTableName(t), t] as const))(
    '%s keys rows by owner_user_id',
    (_name, table) => {
      const columnNames = Object.values(getTableColumns(table)).map(
        c => c.name
      );
      expect(columnNames).toContain('owner_user_id');
    }
  );

  it.each(FINANCE_TABLES.map(t => [getTableName(t), t] as const))(
    '%s has no creator/workspace/membership column',
    (_name, table) => {
      const columnNames = Object.values(getTableColumns(table)).map(
        c => c.name
      );
      for (const col of columnNames) {
        expect(col).not.toMatch(/creator|workspace|member|profile|org/i);
      }
    }
  );
});

describe('finance RLS migrations (JOV-4609, JOV-4620)', () => {
  const sql = MIGRATION_PATHS.map(p => readFileSync(p, 'utf8')).join('\n');

  it.each(FINANCE_TABLES.map(t => getTableName(t)))(
    '%s has FORCE RLS and an owner-only policy',
    tableName => {
      expect(sql).toContain(
        `ALTER TABLE "${tableName}" ENABLE ROW LEVEL SECURITY`
      );
      expect(sql).toContain(
        `ALTER TABLE "${tableName}" FORCE ROW LEVEL SECURITY`
      );
      expect(sql).toContain(
        `CREATE POLICY "${tableName}_owner_all"\n  ON "${tableName}"`
      );
    }
  );

  it('enforces owner_user_id = current_app_user_uuid() on every policy', () => {
    const policies = sql.match(/CREATE POLICY "finance_[^"]+"/g) ?? [];
    expect(policies.length).toBe(FINANCE_TABLES.length);
    const ownerPredicate = 'owner_user_id = current_app_user_uuid()';
    // Each policy has both USING and WITH CHECK on the owner predicate.
    const usingCount = sql.split(`USING (${ownerPredicate})`).length - 1;
    const checkCount = sql.split(`WITH CHECK (${ownerPredicate})`).length - 1;
    expect(usingCount).toBe(FINANCE_TABLES.length);
    expect(checkCount).toBe(FINANCE_TABLES.length);
  });

  it('grants no system or owner-bridge bypass on finance tables', () => {
    const financeSection = sql.slice(sql.indexOf('JOV-4609'));
    expect(financeSection).not.toContain('is_system_rls_session');
    expect(financeSection).not.toContain('is_rls_table_owner');
    expect(financeSection).not.toContain('is_rls_session_unset');
  });
});

describe('finance ledger schema owner boundary (JOV-4612)', () => {
  const sql = readFileSync(LEDGER_MIGRATION_PATH, 'utf8');

  it.each(LEDGER_TABLES.map(t => [getTableName(t), t] as const))(
    '%s keys rows by owner_user_id',
    (_name, table) => {
      const columnNames = Object.values(getTableColumns(table)).map(
        c => c.name
      );
      expect(columnNames).toContain('owner_user_id');
      for (const col of columnNames) {
        expect(col).not.toMatch(/creator|workspace|member|profile|org/i);
      }
    }
  );

  it.each(LEDGER_TABLES.map(t => getTableName(t)))(
    '%s has FORCE RLS and an owner-only policy',
    tableName => {
      expect(sql).toContain(
        `ALTER TABLE "${tableName}" ENABLE ROW LEVEL SECURITY`
      );
      expect(sql).toContain(
        `ALTER TABLE "${tableName}" FORCE ROW LEVEL SECURITY`
      );
      expect(sql).toContain(`CREATE POLICY "${tableName}_owner_all"`);
    }
  );

  it('grants no system or owner-bridge bypass on ledger tables', () => {
    const section = sql.slice(sql.indexOf('JOV-4612'));
    expect(section).not.toContain('is_system_rls_session');
    expect(section).not.toContain('is_rls_table_owner');
  });
});

describe('finance classification schema owner boundary (JOV-4615)', () => {
  const sql = readFileSync(CLASSIFICATION_MIGRATION_PATH, 'utf8');

  it.each(CLASSIFICATION_TABLES.map(t => [getTableName(t), t] as const))(
    '%s keys rows by owner_user_id with no creator column',
    (_name, table) => {
      const columnNames = Object.values(getTableColumns(table)).map(
        c => c.name
      );
      expect(columnNames).toContain('owner_user_id');
      for (const col of columnNames) {
        expect(col).not.toMatch(/creator|workspace|member|profile|org/i);
      }
    }
  );

  it.each(CLASSIFICATION_TABLES.map(t => getTableName(t)))(
    '%s has FORCE RLS and an owner-only USING + WITH CHECK policy',
    tableName => {
      expect(sql).toContain(
        `ALTER TABLE "${tableName}" FORCE ROW LEVEL SECURITY`
      );
      expect(sql).toContain(
        `CREATE POLICY "${tableName}_owner_all"\n  ON "${tableName}"\n  FOR ALL\n  USING (owner_user_id = current_app_user_uuid())\n  WITH CHECK (owner_user_id = current_app_user_uuid());`
      );
    }
  );
});

describe('finance schema ↔ migration parity', () => {
  it('covers every finance table exported by the schema module', () => {
    expect(ALL_TABLES.map(t => getTableName(t)).sort()).toEqual([
      'finance_accounts',
      'finance_anomalies',
      'finance_balance_snapshots',
      'finance_budget_settings',
      'finance_budget_targets',
      'finance_classification_rules',
      'finance_exports',
      'finance_institutions',
      'finance_ledger_events',
      'finance_sync_states',
      'finance_transaction_classifications',
      'finance_transaction_splits',
      'finance_transactions',
    ]);
  });

  it.each(ALL_TABLES.map(t => [getTableName(t), t] as const))(
    '%s columns match a migrated definition (type, default, nullability)',
    (_name, table) => {
      const missing = getTableConfig(table)
        .columns.map(columnDdl)
        .filter(ddl => !ALL_MIGRATIONS_SQL.includes(ddl));
      expect(missing).toEqual([]);
    }
  );

  it.each(ALL_TABLES.map(t => [getTableName(t), t] as const))(
    '%s cascades owner deletion from users',
    (_name, table) => {
      const ownerFks = getTableConfig(table)
        .foreignKeys.filter(fk =>
          fk.reference().columns.some(c => c.name === 'owner_user_id')
        )
        .map(fk => ({
          target: getTableName(fk.reference().foreignTable),
          onDelete: fk.onDelete,
        }));
      expect(ownerFks).toEqual([{ target: 'users', onDelete: 'cascade' }]);
    }
  );

  it.each(ALL_TABLES.map(t => [getTableName(t), t] as const))(
    '%s foreign keys match migrated constraints',
    (tableName, table) => {
      for (const fk of getTableConfig(table).foreignKeys) {
        const ref = fk.reference();
        expect(ALL_MIGRATIONS_SQL).toContain(
          `ALTER TABLE "${tableName}" ADD CONSTRAINT "${fk.getName()}" FOREIGN KEY (${quoteList(
            ref.columns.map(c => c.name)
          )}) REFERENCES "public"."${getTableName(ref.foreignTable)}"(${quoteList(
            ref.foreignColumns.map(c => c.name)
          )}) ON DELETE ${fk.onDelete} ON UPDATE no action`
        );
      }
    }
  );

  it.each(ALL_TABLES.map(t => [getTableName(t), t] as const))(
    '%s indexes match migrated indexes',
    (tableName, table) => {
      for (const index of getTableConfig(table).indexes) {
        const { name, unique, columns } = index.config;
        const columnNames = columns.map(c => (c as PgColumn).name);
        const statement = `CREATE ${unique ? 'UNIQUE ' : ''}INDEX (IF NOT EXISTS )?"${name}" ON "${tableName}" USING btree \\(${columnNames.map(c => `"${c}"`).join(',')}\\)`;
        expect(ALL_MIGRATIONS_SQL).toMatch(new RegExp(statement));
      }
    }
  );

  it('indexes owner_user_id on every table where it is not the primary key', () => {
    for (const table of ALL_TABLES) {
      const config = getTableConfig(table);
      const ownerIsPrimary = config.columns.some(
        c => c.name === 'owner_user_id' && c.primary
      );
      if (ownerIsPrimary) continue;
      const ownerIndexed = config.indexes.some(index =>
        index.config.columns.some(c => (c as PgColumn).name === 'owner_user_id')
      );
      expect(ownerIndexed, config.name).toBe(true);
    }
  });
});
