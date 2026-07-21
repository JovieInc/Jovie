import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const webRoot = path.resolve(__dirname, '../../..');
const cssPath = 'app/(home)/home.css';
const readSource = (relativePath: string) =>
  readFileSync(path.join(webRoot, relativePath), 'utf8');
const footerCtaCssBlock = (source: string) => {
  const start = source.indexOf('SYSTEM B MOUNTED HOME FOOTER CTA PRIMITIVES');
  const end = source.indexOf(
    'SYSTEM B MOUNTED HOME FOOTER CTA PRIMITIVES END',
    start
  );
  expect(start, 'footer CTA CSS block exists').toBeGreaterThanOrEqual(0);
  expect(end, 'footer CTA CSS block is bounded').toBeGreaterThan(start);
  return source.slice(start, end);
};

describe('mounted homepage footer CTA System B source contract', () => {
  it('keeps mounted footer CTA markup on named System B primitives', () => {
    const layoutSource = readSource('app/(home)/layout.tsx');
    const finalCtaSource = readSource(
      'components/marketing/homepage-v2/HomepageV2Ctas.tsx'
    );

    expect(layoutSource).toContain('<MarketingFooter');
    expect(layoutSource).toContain("variant='minimal'");
    expect(layoutSource).toContain("className='system-b-mounted-home-footer'");
    expect(finalCtaSource).toMatch(
      /(?=.*system-b-mounted-home-footer-cta(?!-))(?=.*system-b-mounted-home-footer-cta-container)(?=.*system-b-mounted-home-footer-cta-copy)(?=.*system-b-mounted-home-footer-cta-heading)(?=.*system-b-mounted-home-footer-cta-action)/s
    );
    expect(finalCtaSource).not.toMatch(
      /HOMEPAGE_FINAL_CTA_ARCS|homepage-final-cta-ray|stopColor=|linearGradient|bg-black|text-white|tracking-\[-|text-\[clamp/
    );
  });

  it('keeps mounted footer CTA CSS tokenized and stable', () => {
    const homeCss = readSource(cssPath);
    const css = footerCtaCssBlock(homeCss);

    expect(css).not.toMatch(
      /#[0-9a-fA-F]{3,8}|rgba?\(|hsla?\(|linear-gradient|radial-gradient|box-shadow:|letter-spacing:\s*-[^;]+|font-size:[^;]*vw|(?:background|color|border(?:-[^:]+)?|text-decoration-color):[^;]*(?<!-)\b(?:white|black)\b/
    );
    expect(homeCss).not.toMatch(
      /--homepage-footer-cta-(top|bottom)|\\.home-viewport \\.marketing-footer-premium > div|homepage-final-cta-rays/
    );
    expect(css).toMatch(
      /(?=.*var\(--system-b-bg-page\))(?=.*var\(--color-text-primary-token\))(?=.*var\(--color-text-tertiary-token\))(?=.*var\(--system-b-app-frame-seam\))(?=.*var\(--homepage-page-gutter\))(?=.*var\(--ds-public-content-max\))(?=.*var\(--text-4xl\))(?=.*var\(--text-xs\))(?=.*var\(--space-)(?=.*\.home-viewport \.system-b-mounted-home-footer)(?=.*@media \(max-width: 767px\))(?=.*letter-spacing: 0;)/s
    );
    // Content column: footer locks onto the shared homepage grid
    // (--ds-public-content-max), not the legacy 90rem --homepage-section-max.
    expect(css).not.toContain('var(--homepage-section-max)');
  });
});
