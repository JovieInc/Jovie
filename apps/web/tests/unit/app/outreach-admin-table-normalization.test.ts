import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

function readSource(path: string): string {
  return readFileSync(resolve(process.cwd(), path), 'utf8');
}

describe('outreach admin table normalization', () => {
  it('keeps outreach queue panels on the canonical admin data table wrapper', () => {
    const files = [
      'components/features/admin/outreach/EmailQueuePanel.tsx',
      'components/features/admin/outreach/ReviewQueuePanel.tsx',
    ] as const;

    for (const file of files) {
      const source = readSource(file);

      expect(source).toContain('AdminDataTable');
      expect(source).toContain('TableEmptyState');
      expect(source).not.toContain('ContentTable');
      expect(source).not.toContain('CONTENT_TABLE_');
      expect(source).not.toMatch(/<table\b/);
    }
  });
});
