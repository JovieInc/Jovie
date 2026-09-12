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

function extractDesktopProofGrid(css: string): string {
  const start = css.indexOf('@media (min-width: 1024px)');
  const end = css.indexOf('.homepage-certified-section__inner,', start);
  expect(start, 'desktop proof spacing query exists').toBeGreaterThanOrEqual(0);
  expect(end, 'desktop proof spacing query is bounded').toBeGreaterThan(start);
  return css.slice(start, end);
}

interface LogoBox {
  readonly id: string;
  readonly left: number;
  readonly right: number;
}

function logosOverlap(boxes: readonly LogoBox[]): boolean {
  return boxes.some((box, index) =>
    boxes.slice(index + 1).some(other => box.left < other.right && box.right > other.left)
  );
}

describe('homepage-proof-no-card-v1 (JOV-6201 wave 2)', () => {
  it('keeps the certified proof strip on the page background, never a frosted card', () => {
    const sections = read('components/homepage/HomepageCertifiedSections.tsx');
    const certifiedCss = readCertifiedCss();

    expect(sections).toContain("presentation='inline-strip'");
    expect(sections).toContain('homepage-certified-proof__logos');
    expect(sections).not.toContain("presentation='card'");
    expect(certifiedCss).not.toMatch(
      /\.homepage-certified-proof[\s\S]{0,240}backdrop-filter/
    );
    expect(certifiedCss).not.toMatch(
      /\.homepage-certified-proof[\s\S]{0,240}border-radius:\s*var\(--radius/
    );
  });

  it('matches /pricing compact desktop spacing for the four homepage logos', () => {
    const certifiedCss = readCertifiedCss();
    const desktop = extractDesktopProofGrid(certifiedCss);
    const tablet = certifiedCss.slice(
      certifiedCss.indexOf('@media (min-width: 768px)'),
      certifiedCss.indexOf('@media (min-width: 1024px)')
    );

    expect(tablet).toContain('display: flex');
    expect(tablet).toContain('gap: var(--space-5) var(--space-8)');
    expect(tablet).toContain('min-width: max-content');
    expect(tablet).toContain('max-width: none');
    expect(desktop).toContain('flex-wrap: nowrap');
    expect(desktop).toContain('justify-content: space-between');
    expect(desktop).toContain('gap: var(--space-8)');
    expect(certifiedCss).not.toMatch(
      /\.homepage-certified-proof[\s\S]{0,400}grid-template-columns:\s*minmax\(var\(--space-24\)/
    );

    const collidingFiveTrack = [
      { id: 'awal', left: 0, right: 90 },
      { id: 'orchard', left: 80, right: 170 },
      { id: 'umg', left: 150, right: 600 },
      { id: 'armada', left: 540, right: 640 },
    ];
    const pricedSpacing = [
      { id: 'awal', left: 0, right: 61 },
      { id: 'orchard', left: 93, right: 136 },
      { id: 'umg', left: 168, right: 619 },
      { id: 'armada', left: 651, right: 747 },
    ];
    expect(logosOverlap(collidingFiveTrack)).toBe(true);
    expect(logosOverlap(pricedSpacing)).toBe(false);
  });

  it('clears the sticky marketing-glass nav for every certified heading', () => {
    const css = read('app/(home)/home.css');
    const certifiedCss = readCertifiedCss();

    expect(css).toContain('--homepage-sticky-nav-clearance:');
    expect(css).toContain('scroll-padding-top: var(--homepage-sticky-nav-clearance)');
    expect(certifiedCss).toContain(
      'scroll-margin-top: var(--homepage-sticky-nav-clearance)'
    );
    expect(certifiedCss).toContain('.home-viewport [data-homepage-section-heading]');
    expect(certifiedCss).toContain('.home-viewport .homepage-certified-section__headline');
    expect(css).toContain('--homepage-sticky-nav-height: 2.72rem');
    expect(css).toContain('--homepage-sticky-nav-height: 3.15rem');
  });
});
