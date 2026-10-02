import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

// Regression: the cinematic stage (padding, width, centering) was scoped to
// `.marketing-footer-premium`, so every page-owned MarketingFooterCta
// (/product, /ai, /about, /cli, /download, /changelog) rendered unstyled.
const read = (path: string) =>
  readFileSync(resolve(process.cwd(), path), 'utf8');

describe('cinematic terminal CTA stage ownership', () => {
  it('owns its stage CSS on the variant class, not the footer mount', () => {
    const component = read('components/site/MarketingTerminalCta.tsx');
    const css = read('components/site/MarketingTerminalCta.css');

    expect(component).toContain("import './MarketingTerminalCta.css';");
    expect(component).toContain('marketing-terminal-cta--cinematic');
    expect(css).toMatch(
      /\.marketing-terminal-cta--cinematic \.homepage-final-cta-copy \{[^}]*padding-block/
    );
    expect(css).not.toContain('.marketing-footer-premium');
  });

  it('does not re-scope the stage under the footer', () => {
    const footerCss = read('components/site/MarketingFooter.css');

    expect(footerCss).not.toMatch(
      /\.marketing-footer-premium \.homepage-(?:story-final-cta|final-cta-)/
    );
  });
});
