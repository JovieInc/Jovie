import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const MIGRATION = '0138_bind_tenant_write_ownership';
const sql = readFileSync(
  join(process.cwd(), 'drizzle/migrations', `${MIGRATION}.sql`),
  'utf8'
);

describe('JOV-8246 tenant write ownership migration', () => {
  it('is registered in the append-only drizzle journal', () => {
    const journal = JSON.parse(
      readFileSync(
        join(process.cwd(), 'drizzle/migrations/meta/_journal.json'),
        'utf8'
      )
    ) as { entries: Array<{ tag: string }> };

    expect(journal.entries.some(entry => entry.tag === MIGRATION)).toBe(true);
  });

  it.each([
    'creator_profiles',
    'profile_photos',
    'user_profile_claims',
    'billing_audit_log',
    'stripe_webhook_events',
  ])('removes the unset-session owner bridge from %s', table => {
    expect(sql).toContain(
      `DROP POLICY IF EXISTS "${table}_owner_bridge" ON "${table}"`
    );
  });

  it('binds profile inserts and claims to the authenticated owner', () => {
    expect(sql).toContain('CREATE POLICY "creator_profiles_insert_owner"');
    expect(sql).toContain(
      'CREATE POLICY "creator_profiles_claim_authenticated"'
    );
    expect(sql).toContain('user_id = current_app_user_uuid()');
    const policyStart = sql.indexOf(
      'CREATE POLICY "creator_profiles_insert_owner"'
    );
    const policyEnd = sql.indexOf('--> statement-breakpoint', policyStart);
    expect(sql.slice(policyStart, policyEnd)).not.toContain('user_id IS NULL');
  });

  it('requires both claimant identity and target-profile ownership', () => {
    expect(sql).toContain(
      'CREATE OR REPLACE FUNCTION current_app_user_owns_profile(p_profile_id uuid)'
    );
    for (const policy of [
      'user_profile_claims_insert_owner',
      'user_profile_claims_update_owner',
    ]) {
      const policyStart = sql.indexOf(`CREATE POLICY "${policy}"`);
      expect(policyStart).toBeGreaterThan(-1);
      const policySql = sql.slice(policyStart, sql.indexOf(';', policyStart));
      expect(policySql).toContain('user_id = current_app_user_uuid()');
      expect(policySql).toContain(
        'current_app_user_owns_profile(creator_profile_id)'
      );
    }
  });

  it('keeps public reads and system ingestion explicitly scoped', () => {
    expect(sql).not.toContain('WITH CHECK (true)');
    expect(sql).not.toContain('is_rls_session_unset()');

    const baseline = readFileSync(
      join(process.cwd(), 'drizzle/migrations/0086_sensitive_tables_rls.sql'),
      'utf8'
    );
    expect(baseline).toContain('creator_profiles_select_public');
    expect(baseline).toContain('profile_photos_select_public');
    expect(baseline).toContain('creator_profiles_system_all');
    expect(baseline).toContain('billing_audit_log_system_all');
  });

  it('makes customer billing history append-only and owner-bound', () => {
    expect(sql).toContain('CREATE POLICY "billing_audit_log_insert_own"');
    expect(sql).toContain('user_id = current_app_user_uuid()');
    expect(sql).not.toContain('billing_audit_log_update_own');
  });
});
