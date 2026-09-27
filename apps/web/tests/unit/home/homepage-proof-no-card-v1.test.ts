import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const webRoot = path.resolve(__dirname, '../../..');

function read(rel: string): string {
  return readFileSync(path.join(webRoot, rel), 'utf8');
}

function readCertifiedCss(): string {
  const css = read('components/homepage/HomepageIdentity.css');
  expect(css.length, 'homepage identity CSS exists').toBeGreaterThan(0);
  return css;
}

describe('homepage-proof-no-card-v1 (JOV-6201 wave 2)', () => {
  it('omits unsupported adoption proof until it has an attributable receipt', () => {
    const sections = read('components/homepage/HomepageCertifiedSections.tsx');
    const routeManifest = read('data/marketing/routeManifest.ts');

    expect(sections).not.toContain('HomeTrustSection');
    expect(sections).not.toContain('marketing-section-logo-cloud');
    expect(sections).not.toContain('homepage-certified-proof');

    const homepageEntry = routeManifest.slice(
      routeManifest.indexOf("glob: '(home)/page.tsx'"),
      routeManifest.indexOf("glob: '(marketing)/new/page.tsx'")
    );
    expect(homepageEntry).not.toContain("'logo-cloud'");
    expect(homepageEntry).toContain('unsupported adoption strip');
  });

  it('keeps the editorial body on the shared page background with stable spacing', () => {
    const certifiedCss = readCertifiedCss();

    // The material strip reserves its box at every breakpoint (no CLS).
    expect(certifiedCss).toContain('aspect-ratio: 5 / 2');
    expect(certifiedCss).toContain('aspect-ratio: 5 / 1');
    expect(certifiedCss).toContain('aspect-ratio: 9 / 1');
    expect(certifiedCss).toContain('homepage-identity-structure__list');
    expect(certifiedCss).toContain(
      'padding-block: clamp(var(--space-12), 5vw, var(--space-16))'
    );
    expect(certifiedCss).not.toMatch(/backdrop-filter/);
    expect(certifiedCss).not.toMatch(/box-shadow:/);
  });

  it('clears the sticky marketing-glass nav for every editorial heading', () => {
    const css = read('app/(home)/home.css');
    const certifiedCss = readCertifiedCss();

    expect(css).toContain('--homepage-sticky-nav-clearance:');
    expect(css).toContain(
      'scroll-padding-top: var(--homepage-sticky-nav-clearance)'
    );
    expect(certifiedCss).toContain(
      'scroll-margin-top: var(--homepage-sticky-nav-clearance)'
    );
    expect(certifiedCss).toContain(
      '.home-viewport [data-homepage-section-heading]'
    );
    expect(read('components/homepage/HomepageCertifiedSections.tsx')).toContain(
      'data-homepage-section-heading'
    );
  });
});
