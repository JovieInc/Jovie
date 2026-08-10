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

describe('shared InvestorBrief 44px target geometry (web-188 + web-195)', () => {
  const componentPath = join(
    process.cwd(),
    'components/features/pitch/InvestorBrief.tsx'
  );

  it('wraps the Jovie Home wordmark link in a 44px hit target', () => {
    const component = readFileSync(componentPath, 'utf8');

    expect(component).toContain("aria-label='Jovie Home'");
    expect(component).toContain(
      "className='inline-flex min-h-11 items-center'"
    );
    // The wordmark Logo stays the only logo component — no duplicate header/logo.
    expect(component).toContain(
      "import { Logo } from '@/components/atoms/Logo'"
    );
  });

  it('keeps the meeting CTA on the md Button size with its mailto and event', () => {
    const component = readFileSync(componentPath, 'utf8');

    expect(component).not.toContain("size='sm'");
    expect(component).toContain("variant='primary' size='md'");
    expect(
      component.match(/data-pitch-event='meeting_cta_clicked'/gu)
    ).toHaveLength(2);
    expect(
      component.match(/mailto:\$\{CONTACT_EMAIL\}/gu)?.length
    ).toBeGreaterThanOrEqual(2);
  });

  it('moves disclosure padding onto each summary with a 44px floor', () => {
    const component = readFileSync(componentPath, 'utf8');

    // No vertical padding remains on the details rows themselves.
    expect(component).not.toMatch(/<details[^>]*className='[^']*\bpy-\d/iu);

    const summaries = component.match(/<summary\b[^>]*>/gu) ?? [];
    expect(summaries).toHaveLength(3);
    for (const summary of summaries) {
      expect(summary).toContain('min-h-11');
      expect(summary).toMatch(/\bpy-[68]\b/u);
    }
  });
});
