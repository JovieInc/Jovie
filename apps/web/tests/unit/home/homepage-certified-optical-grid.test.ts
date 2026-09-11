import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { HOMEPAGE_OFFSET_COPY_RED_CSS } from './homepage-optical-polish-red-fixtures';

const webRoot = path.resolve(__dirname, '../../..');
const cssPath = 'app/(home)/home.css';
const sectionsPath = 'components/homepage/HomepageCertifiedSections.tsx';

function extractCertifiedCss(): string {
  const source = readFileSync(path.join(webRoot, cssPath), 'utf8');
  const start = source.indexOf('HOMEPAGE CERTIFIED SECTIONS START');
  const end = source.indexOf('HOMEPAGE CERTIFIED SECTIONS END', start);
  expect(start, 'certified CSS block exists').toBeGreaterThanOrEqual(0);
  expect(end, 'certified CSS block is bounded').toBeGreaterThan(start);
  return source.slice(start, end);
}

/** Right-copy / left-media start on the shared 12-col span-6 contract. */
function sharedRightColumnStart(
  innerWidth: number,
  columnGap: number
): number {
  const track = (innerWidth - 11 * columnGap) / 12;
  return 6 * track + 6 * columnGap;
}

function offsetCopyStart(innerWidth: number, readingWidth = 34 * 16): number {
  return innerWidth - readingWidth;
}

describe('homepage certified optical grid (homepage-optical-polish-v1 item 1)', () => {
  it('uses explicit desktop column spans for every editorial section', () => {
    const css = extractCertifiedCss();
    const desktop = css.slice(css.indexOf('@media (min-width: 900px)'));

    expect(desktop).toContain('grid-template-columns: repeat(12, minmax(0, 1fr))');
    expect(desktop).toContain('grid-column: 1 / span 6');
    expect(desktop).toContain('grid-column: 7 / span 6');
    expect(desktop).not.toContain('repeat(2, minmax(0, 1fr))');
    expect(desktop).not.toContain('[data-media="true"]');
    expect(desktop).not.toMatch(/margin-left:\s*auto/);
    expect(desktop).not.toMatch(/^\s*order:\s*[12]/m);

    expect(css).toMatch(
      /\.homepage-certified-section__copy\s*\{[^}]*max-width:\s*34rem/
    );
  });

  it('keeps 34rem as a reading-width limit, not the thing that positions the column', () => {
    const css = extractCertifiedCss();
    const copyBlock = css.slice(
      css.indexOf('.homepage-certified-section__copy {'),
      css.indexOf('.homepage-certified-section__headline,')
    );

    expect(copyBlock).toContain('max-width: 34rem');
    expect(copyBlock).not.toMatch(/margin-left:\s*auto/);
    expect(copyBlock).not.toMatch(/margin-inline:\s*auto/);
  });

  it('rejects the offset-copy deliberate-red fixture that would drift at 900px', () => {
    const css = extractCertifiedCss();
    const innerWidth = 860;
    const columnGap = 18;
    const sharedStart = sharedRightColumnStart(innerWidth, columnGap);
    const offsetStart = offsetCopyStart(innerWidth);

    expect(HOMEPAGE_OFFSET_COPY_RED_CSS).toContain("data-deliberate-red='homepage-offset-copy'");
    expect(HOMEPAGE_OFFSET_COPY_RED_CSS).toContain('margin-left: auto');
    expect(HOMEPAGE_OFFSET_COPY_RED_CSS).toContain('max-width: 34rem');
    expect(css).not.toMatch(/margin-left:\s*auto/);

    // Geometry: hugging the rail with 34rem is ~120px left of the shared
    // span-6 start on the 900px inner rail. That offset is the bug.
    expect(sharedStart).toBeCloseTo(439, 0);
    expect(offsetStart).toBe(316);
    expect(sharedStart - offsetStart).toBeGreaterThan(80);
  });

  it('does not change locked section ownership, copy, or media pairing', () => {
    const source = readFileSync(path.join(webRoot, sectionsPath), 'utf8');
    expect(source).toContain("data-align={index % 2 === 0 ? 'start' : 'end'}");
    expect(source).toContain('HOMEPAGE_LAUNCH_COPY.certified');
    expect(source).toContain("id === 'connected'");
    expect(source).toContain("id === 'relationships'");
  });
});
