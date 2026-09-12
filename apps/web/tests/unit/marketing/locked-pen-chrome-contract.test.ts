import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { HOMEPAGE_LAUNCH_COPY } from '@/data/homepageLaunchCopy';
import { MARKETING_PEN_CONTRACT_IDS } from '@/data/marketing/penContracts';

function readWebSource(path: string): string {
  return readFileSync(resolve(process.cwd(), path), 'utf8');
}

describe('locked Pen marketing chrome (JOV-6179)', () => {
  it('binds production header and footer to founder-locked Pen nodes', () => {
    expect(MARKETING_PEN_CONTRACT_IDS.shell.header).toBe('GTcgO');
    expect(MARKETING_PEN_CONTRACT_IDS.shell.footer).toBe('jhV4a');

    const contracts = readWebSource('data/marketing/penContracts.ts');
    expect(contracts).not.toContain("header: 'KfGTq'");
    expect(contracts).not.toContain("footer: 'pctmZ'");

    const header = readWebSource('components/site/MarketingHeader.tsx');
    const footer = readWebSource('components/site/MarketingFooter.tsx');
    const shell = readWebSource('components/site/PublicPageShell.tsx');
    const homeLayout = readWebSource('app/(home)/layout.tsx');
    const marketingLayout = readWebSource('app/(marketing)/layout.tsx');

    expect(header).toContain(
      'penContractId={MARKETING_PEN_CONTRACT_IDS.shell.header}'
    );
    expect(footer).toContain(
      'data-pen-contract={MARKETING_PEN_CONTRACT_IDS.shell.footer}'
    );
    expect(shell).toContain('<MarketingHeader');
    expect(shell).toContain('<MarketingFooter');
    expect(homeLayout).toContain('<PublicPageShell');
    expect(marketingLayout).toContain('<PublicPageShell');
  });

  it('keeps footer chrome on noir-ion atoms instead of a parallel hex ladder', () => {
    const footerCss = readWebSource('components/site/MarketingFooter.css');

    expect(footerCss).toContain('background: var(--noir-ion-shell)');
    expect(footerCss).toContain('--mf-hairline: var(--noir-ion-border-subtle)');
    expect(footerCss).toContain('--mf-text: var(--noir-ion-text-primary)');
    expect(footerCss).not.toContain('#06070a');
    expect(footerCss).not.toContain('rgba(255, 255, 255, 0.07)');
  });

  it('does not reopen the locked homepage IA or Find me conversion', () => {
    const homepagePage = readWebSource('app/(home)/page.tsx');
    const certified = readWebSource(
      'components/homepage/HomepageCertifiedSections.tsx'
    );

    expect(HOMEPAGE_LAUNCH_COPY.hero.search.action).toBe('Find me');
    expect(HOMEPAGE_LAUNCH_COPY.certified.sections).toHaveLength(6);
    expect(
      HOMEPAGE_LAUNCH_COPY.certified.sections.map(section => section.id)
    ).toEqual([
      'connected',
      'found',
      'know',
      'relationships',
      'smarter',
      'built',
    ]);
    expect(homepagePage).toContain('HomepageEditorialHero');
    expect(homepagePage).toContain('HomepageCertifiedSections');
    expect(homepagePage).toContain('HomepageClose');
    expect(certified).toContain('HOMEPAGE_LAUNCH_COPY.certified');
    expect(certified).not.toContain('GTcgO');
    expect(certified).not.toContain('jhV4a');
  });
});
