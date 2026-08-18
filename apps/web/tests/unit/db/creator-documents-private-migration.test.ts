import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const migrationPath = join(
  process.cwd(),
  'drizzle/migrations/0093_graceful_ronan.sql'
);

describe('creator documents private migration', () => {
  it('forces row-level security on every private creator table', async () => {
    const sql = await readFile(migrationPath, 'utf8');
    for (const table of [
      'creator_documents',
      'creator_document_revisions',
      'creator_revision_claims',
      'creator_revision_approvals',
      'creator_capture_handoffs',
    ]) {
      expect(sql).toContain(`ALTER TABLE "${table}" ENABLE ROW LEVEL SECURITY`);
      expect(sql).toContain(`ALTER TABLE "${table}" FORCE ROW LEVEL SECURITY`);
      expect(sql).toContain(`${table}_owner_bridge`);
    }
  });

  it('freezes claim ledgers and validates approval and handoff tuples', async () => {
    const sql = await readFile(migrationPath, 'utf8');
    expect(sql).toContain('creator_claim_ledger_open_guard');
    expect(sql).toContain('creator_revision_immutable_guard');
    expect(sql).toContain('creator document revisions are immutable');
    expect(sql).toContain('creator claim revision is immutable');
    expect(sql).toContain("v_stage IS DISTINCT FROM 'private_draft'");
    expect(sql).toContain('FOR UPDATE OF d');
    expect(sql).toContain('creator_approval_integrity_guard');
    expect(sql).toContain('creator_handoff_integrity_guard');
    expect(sql).toContain('a.revoked_at IS NULL');
    expect(sql).toContain(
      'CREATE CONSTRAINT TRIGGER creator_handoff_integrity_guard'
    );
    expect(sql).toContain('DEFERRABLE INITIALLY DEFERRED');
    expect(sql).toContain('creator_documents_profile_created_idx');
    expect(sql).toContain(
      'ALTER TABLE "tasks" ADD COLUMN "mutation_version" integer DEFAULT 1 NOT NULL'
    );
  });

  it('requires canonical claims for private creator documents', async () => {
    const sql = await readFile(migrationPath, 'utf8');
    const ownershipFunctions = sql.slice(
      sql.indexOf(
        'CREATE OR REPLACE FUNCTION can_manage_private_creator_profile'
      ),
      sql.indexOf('CREATE POLICY "creator_documents_select_private"')
    );

    expect(ownershipFunctions).not.toContain('cp.user_id');
    expect(
      ownershipFunctions.match(/FROM user_profile_claims upc/g)
    ).toHaveLength(2);
  });
});
