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

  it('keeps campaign metric labels in canonical Title Case', () => {
    const source = readSource(
      'components/features/admin/campaigns/InviteCampaignManager.tsx'
    );

    expect(source).toContain("label='Invites Sent'");
    expect(source).toContain("label='Unique Click-throughs'");
    expect(source).toContain("label='Profiles Claimed'");
    expect(source).toContain("label='Claim Conversion Rate'");
    expect(source).toContain("label='Total Eligible'");
    expect(source).toContain("label='With Contact Email'");
    expect(source).toContain("label='Missing Email'");
    expect(source).not.toContain("label='Invites sent'");
    expect(source).not.toContain("label='Unique click-throughs'");
    expect(source).not.toContain("label='Profiles claimed'");
    expect(source).not.toContain("label='Claim conversion rate'");
    expect(source).not.toContain("label='Total eligible'");
    expect(source).not.toContain("label='With contact email'");
    expect(source).not.toContain("label='Missing email'");
    expect(source).not.toContain('@jovie/canonical-ui-label-casing');
  });
});
