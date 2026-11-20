import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const webRoot = path.resolve(__dirname, '../../../..');

function readWebFile(relativePath: string) {
  return readFileSync(path.join(webRoot, relativePath), 'utf8');
}

const contextualActionColumns = [
  'app/app/(shell)/library/LibrarySurface.tsx',
  'components/features/dashboard/organisms/contacts-table/columns.tsx',
  'components/features/admin/admin-users-table/AdminUsersTableUnified.tsx',
  'components/features/admin/admin-creator-profiles/utils/column-definitions.tsx',
  'components/features/admin/waitlist-table/AdminWaitlistTableUnified.tsx',
];

describe('table action contract', () => {
  it('keeps residual entity-table overflow slots contextual and semantically named', () => {
    for (const relativePath of contextualActionColumns) {
      const source = readWebFile(relativePath);

      expect(source, relativePath).toContain("header: 'Actions'");
      expect(source, relativePath).toContain("headerVisibility: 'sr-only'");
      expect(source, relativePath).toContain("actionVisibility: 'contextual'");
    }
  });

  it('keeps Identity edit and overflow actions visible without hover', () => {
    const source = readWebFile(
      'app/app/(shell)/profiles/ProfilesWorkspace.tsx'
    );
    expect(source).toContain("header: 'Actions'");
    expect(source).toContain("headerVisibility: 'sr-only'");
    expect(source).not.toContain("actionVisibility: 'contextual'");
    expect(source).toContain("aria-label='Edit Jovie Profile'");
    expect(source).toContain('aria-label={`Actions for ${row.label}`}');
  });

  it('routes legacy action renderers through the shared contextual slot', () => {
    for (const relativePath of [
      'components/features/dashboard/organisms/dashboard-audience-table/utils/column-renderers.tsx',
    ]) {
      expect(readWebFile(relativePath), relativePath).toContain(
        'system-b-table-contextual-action'
      );
    }
  });
});
