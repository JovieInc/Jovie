import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const WEB_ROOT = join(process.cwd());

function read(relativePath: string) {
  return readFileSync(join(WEB_ROOT, relativePath), 'utf8');
}

describe('investor brief source contract', () => {
  it('links the deck download to the gated portal route, never public/', () => {
    const component = read('components/features/pitch/InvestorBrief.tsx');

    expect(component).toContain(
      "const PITCH_DECK_PDF_URL = '/investor-portal/deck/Jovie-Pitch-Deck.pdf'"
    );
  });

  it('keeps the shipped body bound to checked-in registry evidence', () => {
    const component = read('components/features/pitch/InvestorBrief.tsx');

    expect(component).toContain('bg-(--color-bg-base)/90');
    expect(component).toContain('const registry = fundraisingRegistry');
    expect(component).toContain('narrativeSlides.map');
    expect(component).toContain('registry.operatingLoop.map');
    expect(component).toContain('registry.risks.map');
    expect(component).toContain('data-pitch-demo-video');
  });

  it('keeps the YC deck order behind an off-by-default flag', () => {
    const component = read('components/features/pitch/InvestorBrief.tsx');
    const flags = read('lib/flags/code-flags.ts');

    expect(flags).toContain('INVESTOR_PORTAL_YC_DECK: false');
    expect(component).toContain("isCodeFlagEnabled('INVESTOR_PORTAL_YC_DECK')");
    expect(component).toContain(
      'buildInvestorYcDeck(registry, loadInvestorSourcedMetrics())'
    );
    expect(component).toContain('registry.coreSlides');
  });

  it('keeps exactly one primary-variant CTA on the screen', () => {
    const component = read('components/features/pitch/InvestorBrief.tsx');
    const primaries =
      component.match(
        /<Button\b[^>]*variant='primary'[^>]*>[\s\S]*?<\/Button>/g
      ) ?? [];

    expect(primaries).toHaveLength(1);
    expect(primaries[0]).toContain("size='md'");
    expect(primaries[0]).toContain("<a href='#demo'>Watch The Product</a>");
    expect(primaries[0]).not.toContain('meeting_cta_clicked');
  });
});
