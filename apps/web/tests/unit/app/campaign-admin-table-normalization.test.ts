import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

function readSource(path: string): string {
  return readFileSync(resolve(process.cwd(), path), 'utf8');
}

describe('campaign admin table normalization', () => {
  it('keeps campaign invite tables on the canonical admin data table wrapper', () => {
    const source = readSource(
      'components/features/admin/campaigns/InviteCampaignManager.tsx'
    );

    expect(source).toContain('AdminDataTable');
    expect(source).toContain('TableEmptyState');
    expect(source).not.toContain('CampaignDataTable');
    expect(source).not.toContain('CampaignTableHeaderCell');
    expect(source).not.toContain('CampaignTableCell');
    expect(source).not.toMatch(/<table\b/);
  });
});
