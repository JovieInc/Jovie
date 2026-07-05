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

const GTM_COLLAPSIBLES = findSourceFile(
  resolve(process.cwd(), 'components/features/admin/leads/GtmCollapsibles.tsx'),
  resolve(
    process.cwd(),
    'apps/web/components/features/admin/leads/GtmCollapsibles.tsx'
  )
);

const GROWTH_INTAKE_COMPOSER = findSourceFile(
  resolve(
    process.cwd(),
    'components/features/admin/leads/GrowthIntakeComposer.tsx'
  ),
  resolve(
    process.cwd(),
    'apps/web/components/features/admin/leads/GrowthIntakeComposer.tsx'
  )
);

const LEAD_KEYWORDS_MANAGER = findSourceFile(
  resolve(
    process.cwd(),
    'components/features/admin/leads/LeadKeywordsManager.tsx'
  ),
  resolve(
    process.cwd(),
    'apps/web/components/features/admin/leads/LeadKeywordsManager.tsx'
  )
);

const LEAD_PIPELINE_CONTROLS = findSourceFile(
  resolve(
    process.cwd(),
    'components/features/admin/leads/LeadPipelineControls.tsx'
  ),
  resolve(
    process.cwd(),
    'apps/web/components/features/admin/leads/LeadPipelineControls.tsx'
  )
);

const OUTREACH_KPIS = findSourceFile(
  resolve(process.cwd(), 'components/features/admin/outreach/OutreachKpis.tsx'),
  resolve(
    process.cwd(),
    'apps/web/components/features/admin/outreach/OutreachKpis.tsx'
  )
);

const INVITE_CAMPAIGN_MANAGER = findSourceFile(
  resolve(
    process.cwd(),
    'components/features/admin/campaigns/InviteCampaignManager.tsx'
  ),
  resolve(
    process.cwd(),
    'apps/web/components/features/admin/campaigns/InviteCampaignManager.tsx'
  )
);

describe('admin growth GtmCollapsibles shell normalization', () => {
  it('passes embedded mode to accordion children so parent chrome owns the surface', () => {
    const source = readFileSync(GTM_COLLAPSIBLES, 'utf8');

    expect(source).toContain('<LeadKeywordsManager embedded />');
    expect(source).toContain(
      '<LeadPipelineControls hideMainSwitch embedded />'
    );
    expect(source).toContain('<OutreachOverviewPanel embedded />');
    expect(source).toContain('<InviteCampaignManager embedded />');
    expect(source).not.toContain('These values are set automatically');
  });

  it('removes redundant intake heading copy inside the Tools accordion', () => {
    const source = readFileSync(GROWTH_INTAKE_COMPOSER, 'utf8');

    expect(source).not.toContain('Unified Intake');
    expect(source).not.toMatch(
      /Add one profile, run a batch import, or feed fresh lead URLs/
    );
  });

  it('supports flat embedded rendering for discovery keywords', () => {
    const source = readFileSync(LEAD_KEYWORDS_MANAGER, 'utf8');

    expect(source).toContain('readonly embedded?: boolean');
    expect(source).toContain('if (embedded) {');
    expect(source).toContain('Discovery Keywords');
  });

  it('supports flat embedded rendering for pipeline overrides', () => {
    const source = readFileSync(LEAD_PIPELINE_CONTROLS, 'utf8');

    expect(source).toContain('readonly embedded?: boolean');
    expect(source).toContain('if (embedded) {');
  });

  it('supports flat embedded rendering for outreach KPIs', () => {
    const source = readFileSync(OUTREACH_KPIS, 'utf8');

    expect(source).toContain('readonly embedded?: boolean');
    expect(source).toContain('if (embedded) {');
    expect(source).not.toContain('TOTAL QUEUED');
  });

  it('supports flat embedded rendering for campaign sections', () => {
    const source = readFileSync(INVITE_CAMPAIGN_MANAGER, 'utf8');

    expect(source).toContain('readonly embedded?: boolean');
    expect(source).toContain('embedded={embedded}');
    expect(source).toContain('if (embedded) {');
  });
});
