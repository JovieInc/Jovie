import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const postReleaseMigration = join(
  process.cwd(),
  'drizzle/migrations/0098_regular_puff_adder.sql'
);
const snapshot = join(
  process.cwd(),
  'drizzle/migrations/meta/0098_snapshot.json'
);
const schemaModule = join(process.cwd(), 'lib/db/schema/library-presence.ts');
const promoSchemaModule = join(
  process.cwd(),
  'lib/db/schema/promo-downloads.ts'
);

describe('library post-release private migration', () => {
  it('defines typed Drizzle schema for presence, rights, and attestation columns', async () => {
    const schema = await readFile(schemaModule, 'utf8');
    const promoSchema = await readFile(promoSchemaModule, 'utf8');
    const snapshotJson = JSON.parse(await readFile(snapshot, 'utf8'));
    for (const [tableName, exportName] of [
      ['library_presence_findings', 'libraryPresenceFindings'],
      ['library_rightsholder_evidence', 'libraryRightsholderEvidence'],
    ] as const) {
      expect(schema).toContain(`export const ${exportName} = pgTable(`);
      expect(schema).toContain(`'${tableName}'`);
      expect(snapshotJson.tables[`public.${tableName}`]).toBeDefined();
    }
    expect(promoSchema).toContain("boolean('rights_control_attested')");
    expect(
      snapshotJson.tables['public.promo_downloads'].columns
        .rights_control_attested
    ).toMatchObject({ default: false, notNull: true });
  });

  it('forces private access and evidence truthfulness for post-release data', async () => {
    const sql = await readFile(postReleaseMigration, 'utf8');
    for (const table of [
      'library_presence_findings',
      'library_rightsholder_evidence',
      'promo_downloads',
      'promo_download_events',
    ]) {
      expect(sql).toContain(`ALTER TABLE "${table}" FORCE ROW LEVEL SECURITY`);
      expect(sql).toContain(`${table}_owner_bridge`);
    }
    expect(sql).toContain('library_rightsholder_evidence_guard');
    expect(sql).toContain('public registry evidence must remain observed');
    expect(sql).toContain('attested evidence requires artist attestation');
  });

  it('fails downloads closed and keeps collision and repair actions local', async () => {
    const sql = await readFile(postReleaseMigration, 'utf8');
    expect(sql).toContain('SET "is_active" = false');
    expect(sql).toContain('promo_download_rights_attestation_guard');
    expect(sql).toContain('active downloads require full-control attestation');
    expect(sql).toContain('library_presence_finding_guard');
    expect(sql).toContain('collision findings require a filter action');
    expect(sql).toContain('queue inputs only: no outbound request is sent');
  });

  it('seeds the founder-locked Tim queue without granting Take Me Over', async () => {
    const sql = await readFile(postReleaseMigration, 'utf8');
    for (const evidence of [
      'http://tw.wtf/listen',
      'LtDL1HHq954',
      '4bc0TJNIiGEJjFYDwHuOjX',
      '3685842',
      '410907',
      'mn0003388877',
      'https://instagram.com/timwhite',
      'https://jov.ie/tim/take-me-over-2',
    ]) {
      expect(sql).toContain(evidence);
    }
    expect(sql).toContain(
      'Multi-writer observation; not a master-control attestation'
    );
    expect(sql).not.toContain("'attested', 'other'");
  });
});
