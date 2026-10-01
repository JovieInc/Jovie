import { readFileSync } from 'node:fs';
import path from 'node:path';
import { getTableColumns, getTableName } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import {
  financeAccounts,
  financeAnomalies,
  financeBalanceSnapshots,
  financeBudgetSettings,
  financeBudgetTargets,
  financeExports,
  financeInstitutions,
  financeLedgerEvents,
  financeSyncStates,
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
  'drizzle/migrations/0129_plain_the_leader.sql'
);

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
