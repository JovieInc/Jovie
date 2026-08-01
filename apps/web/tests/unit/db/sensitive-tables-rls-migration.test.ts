/**
 * JOV-3061: guard that sensitive billing/chat/PII tables ship with RLS + FORCE
 * and deny-by-default style policies in the append-only migration.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const MIGRATION_REL =
  'drizzle/migrations/0086_sensitive_tables_rls.sql' as const;

const SENSITIVE_TABLES = [
  'creator_profiles',
  'profile_photos',
  'user_profile_claims',
  'billing_audit_log',
  'stripe_webhook_events',
  'chat_conversations',
  'chat_messages',
  'tips',
  'ingestion_jobs',
  'admin_audit_log',
] as const;

function loadMigrationSql(): string {
  // Vitest for @jovie/web runs with cwd = apps/web
  return readFileSync(join(process.cwd(), MIGRATION_REL), 'utf8');
}

describe('JOV-3061 sensitive tables RLS migration', () => {
  const sql = loadMigrationSql();

  it('is registered in the drizzle journal', () => {
    const journal = JSON.parse(
      readFileSync(
        join(process.cwd(), 'drizzle/migrations/meta/_journal.json'),
        'utf8'
      )
    ) as { entries: Array<{ tag: string }> };

    expect(
      journal.entries.some(e => e.tag === '0086_sensitive_tables_rls')
    ).toBe(true);
  });

  it('defines RLS identity helpers used by policies', () => {
    expect(sql).toContain('CREATE OR REPLACE FUNCTION current_app_user_uuid()');
    expect(sql).toContain('CREATE OR REPLACE FUNCTION is_system_rls_session()');
    expect(sql).toContain('CREATE OR REPLACE FUNCTION is_rls_session_unset()');
    expect(sql).toContain(
      'CREATE OR REPLACE FUNCTION is_rls_table_owner(p_table text)'
    );
  });

  it.each(SENSITIVE_TABLES)('enables and forces RLS on %s', table => {
    expect(sql).toContain(`ALTER TABLE "${table}" ENABLE ROW LEVEL SECURITY`);
    expect(sql).toContain(`ALTER TABLE "${table}" FORCE ROW LEVEL SECURITY`);
  });

  it('adds ownership or system policies for each sensitive table', () => {
    for (const table of SENSITIVE_TABLES) {
      // Every table must have at least one CREATE POLICY targeting it.
      const policyHits = [
        ...sql.matchAll(
          new RegExp(`CREATE POLICY\\s+"[^"]+"\\s+ON\\s+"${table}"`, 'g')
        ),
      ];
      expect(policyHits.length).toBeGreaterThan(0);
    }
  });

  it('includes owner-only null-session bridge (progressive enforcement)', () => {
    for (const table of SENSITIVE_TABLES) {
      expect(sql).toContain(`${table}_owner_bridge`);
      expect(sql).toContain(`is_rls_table_owner('${table}')`);
    }
  });

  it('includes system session policies for server-only tables', () => {
    for (const table of [
      'billing_audit_log',
      'stripe_webhook_events',
      'ingestion_jobs',
      'admin_audit_log',
    ] as const) {
      expect(sql).toContain(`${table}_system_all`);
      expect(sql).toContain('is_system_rls_session()');
    }
  });

  it('allows public tip inserts and public profile reads', () => {
    expect(sql).toContain('tips_insert_public');
    expect(sql).toContain('creator_profiles_select_public');
    expect(sql).toContain('profile_photos_select_public');
  });
});
