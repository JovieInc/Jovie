import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const webRoot = path.resolve(__dirname, '../../..');

function read(rel: string): string {
  return readFileSync(path.join(webRoot, rel), 'utf8');
}

function readCertifiedCss(): string {
  const css = read('app/(home)/home.css');
  const start = css.indexOf('HOMEPAGE CERTIFIED SECTIONS START');
  const end = css.indexOf('HOMEPAGE CERTIFIED SECTIONS END', start);
  expect(start, 'certified CSS block exists').toBeGreaterThanOrEqual(0);
  expect(end, 'certified CSS block is bounded').toBeGreaterThan(start);
  return css.slice(start, end);
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

    expect(certifiedCss).toContain('aspect-ratio: 1902 / 827');
    expect(certifiedCss).toContain('homepage-relationship-outcomes');
    expect(certifiedCss).toContain(
      'gap: clamp(var(--space-8), 3vw, var(--space-11))'
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
    expect(certifiedCss).toContain(
      '.home-viewport .homepage-certified-section__headline'
    );
  });
});
