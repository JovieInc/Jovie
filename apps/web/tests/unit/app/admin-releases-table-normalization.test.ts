import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

function readSource(path: string): string {
  return readFileSync(resolve(process.cwd(), path), 'utf8');
}

describe('admin releases table normalization', () => {
  it('keeps release issue pills and actions in canonical Title Case', () => {
    const source = readSource(
      'components/features/admin/admin-releases-table/AdminReleasesTableUnified.tsx'
    );

    expect(source).toContain("label: 'No Artwork'");
    expect(source).toContain("label: 'No Providers'");
    expect(source).toContain("label: '0 Tracks'");
    expect(source).toContain("label: 'View On Jovie'");
    expect(source).toContain("label: 'View Profile'");
    expect(source).not.toContain("label: 'No artwork'");
    expect(source).not.toContain("label: 'No providers'");
    expect(source).not.toContain("label: '0 tracks'");
    expect(source).not.toContain("label: 'View on Jovie'");
    expect(source).not.toContain("label: 'View profile'");
    expect(source).not.toContain('@jovie/canonical-ui-label-casing');
  });

  it('keeps release rows on the canonical admin data table wrapper', () => {
    const source = readSource(
      'components/features/admin/admin-releases-table/AdminReleasesTableUnified.tsx'
    );

    expect(source).toContain('AdminDataTable');
    expect(source).toContain('TableEmptyState');
    expect(source).not.toMatch(/<table\b/);
  });
});
