import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const appRoot = join(process.cwd(), 'app');

describe('shared investor brief routing', () => {
  it('uses the canonical brief for the public and tokenized landings', () => {
    const publicPage = readFileSync(join(appRoot, 'pitch/page.tsx'), 'utf8');
    const tokenizedPage = readFileSync(
      join(appRoot, 'investor-portal/page.tsx'),
      'utf8'
    );

    expect(publicPage).toContain('import { InvestorBrief }');
    expect(publicPage).toContain('<InvestorBrief />');
    expect(tokenizedPage).toContain('import { InvestorBrief }');
    expect(tokenizedPage).toContain(
      '<InvestorBrief embedded investorName={investorName} />'
    );
    expect(tokenizedPage).toContain("cookieStore.get('__investor_token')");
  });

  it('does not pass token or investor identity into engagement tracking', () => {
    const engagement = readFileSync(
      join(process.cwd(), 'components/features/pitch/PitchEngagement.tsx'),
      'utf8'
    );

    expect(engagement).not.toMatch(/investorName|investor_name|token/u);
    expect(engagement.indexOf('new Set<string>()')).toBeGreaterThan(
      engagement.indexOf('useEffect(() =>')
    );
  });

  it('attributes both sticky investor actions through document delegation', () => {
    const stickyBar = readFileSync(
      join(appRoot, 'investor-portal/_components/InvestorStickyBar.tsx'),
      'utf8'
    );

    expect(stickyBar).toContain("data-pitch-event='invest_cta_clicked'");
    expect(stickyBar).toContain("data-pitch-event='meeting_cta_clicked'");
  });
});
