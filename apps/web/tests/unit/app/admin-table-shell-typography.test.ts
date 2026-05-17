import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

function findSourceFile(...candidates: string[]): string {
  const found = candidates.find(candidate => existsSync(candidate));
  if (!found) {
    throw new Error(
      `Could not find source file. Checked: ${candidates.join(', ')}`
    );
  }
  return found;
}

const ADMIN_DATA_TABLE = findSourceFile(
  resolve(process.cwd(), 'components/features/admin/table/AdminDataTable.tsx'),
  resolve(
    process.cwd(),
    'apps/web/components/features/admin/table/AdminDataTable.tsx'
  )
);

describe('admin table shell typography', () => {
  it('keeps AdminDataTable backed by the unified shell table', () => {
    const source = readFileSync(ADMIN_DATA_TABLE, 'utf8');

    expect(source).toContain("from '@/components/organisms/table'");
    expect(source).toContain('<UnifiedTable<TData>');
  });

  it('does not force expanded all-caps header tracking', () => {
    const source = readFileSync(ADMIN_DATA_TABLE, 'utf8');

    expect(source).toContain('[&_thead_th]:tracking-normal');
    expect(source).not.toMatch(/uppercase/);
    expect(source).not.toMatch(/tracking-\[(?!-)/);
    expect(source).not.toMatch(/tracking-wide/);
  });
});
