import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = join(__dirname, '../../../..');

function sourcePath(path: string): string {
  return join(ROOT, path);
}

describe('canonical shared table row', () => {
  it('keeps shared table rows on the UnifiedTable row implementation', () => {
    const tableIndex = readFileSync(
      sourcePath('components/organisms/table/index.ts'),
      'utf-8'
    );
    const unifiedTable = readFileSync(
      sourcePath('components/organisms/table/organisms/UnifiedTable.tsx'),
      'utf-8'
    );

    expect(unifiedTable).toContain('import { VirtualizedTableRow }');
    expect(tableIndex).not.toContain('./atoms/TableRow');
    expect(
      existsSync(sourcePath('components/organisms/table/atoms/TableRow.tsx'))
    ).toBe(false);
    expect(
      existsSync(
        sourcePath('components/organisms/table/molecules/TableRow.tsx')
      )
    ).toBe(false);
  });
});
