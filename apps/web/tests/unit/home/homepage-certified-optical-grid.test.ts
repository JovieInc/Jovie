import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  evaluateAcceptanceEvidence,
  evaluateRelationalGrid,
} from '../../../../../scripts/component-rendered-invariant-policy.mjs';
import {
  HOMEPAGE_EXACT_CANDIDATE_ACCEPTANCE_GREEN,
  HOMEPAGE_OFFSET_COPY_RENDERED_RED,
  HOMEPAGE_SHARED_COLUMN_RENDERED_GREEN,
  HOMEPAGE_SOURCE_ONLY_ACCEPTANCE_RED,
} from './homepage-eight-invariants-fixtures';
import { HOMEPAGE_OFFSET_COPY_RED_CSS } from './homepage-optical-polish-red-fixtures';

const webRoot = path.resolve(__dirname, '../../..');
const cssPath = 'components/homepage/HomepageIdentity.css';
const sectionsPath = 'components/homepage/HomepageCertifiedSections.tsx';

function extractCertifiedCss(): string {
  const source = readFileSync(path.join(webRoot, cssPath), 'utf8');
  expect(source.length, 'homepage identity CSS exists').toBeGreaterThan(0);
  return source;
}

/** Right-copy / left-media start on the shared 12-col span-6 contract. */
function sharedRightColumnStart(innerWidth: number, columnGap: number): number {
  const track = (innerWidth - 11 * columnGap) / 12;
  return 6 * track + 6 * columnGap;
}

function offsetCopyStart(innerWidth: number, readingWidth = 34 * 16): number {
  return innerWidth - readingWidth;
}

describe('homepage certified optical grid (homepage-optical-polish-v1 item 1)', () => {
  it('uses explicit desktop column spans for every editorial section', () => {
    const css = extractCertifiedCss();
    const desktop = css.slice(css.indexOf('@media (min-width: 1024px)'));

    expect(desktop).toContain(
      'grid-template-columns: repeat(12, minmax(0, 1fr))'
    );
    expect(desktop).toContain('grid-column: 1 / span 7');
    expect(desktop).toContain('grid-column: 9 / span 4');
    expect(desktop).toContain('grid-column: 1 / span 6');
    expect(desktop).toContain('grid-column: 7 / span 6');
    expect(desktop).toContain('grid-column: 1 / span 4');
    expect(desktop).toContain('grid-column: 5 / span 8');
    expect(desktop).not.toContain('repeat(2, minmax(0, 1fr))');
    expect(desktop).not.toMatch(/margin-left:\s*auto/);
    expect(desktop).not.toMatch(/^\s*order:\s*[12]/m);

    expect(css).toMatch(
      /\.homepage-identity-section__body\s*\{[^}]*max-width:\s*26rem/
    );
  });

  it('keeps reading widths as limits, not the thing that positions a column', () => {
    const css = extractCertifiedCss();
    const bodyBlock = css.slice(
      css.indexOf('.homepage-identity-section__body {'),
      css.indexOf('}', css.indexOf('.homepage-identity-section__body {'))
    );

    expect(bodyBlock).toContain('max-width: 26rem');
    expect(css).not.toMatch(/margin-left:\s*auto/);
    expect(css).not.toMatch(/margin-inline:\s*auto/);
  });

  it('rejects the offset-copy deliberate-red fixture that would drift at 900px', () => {
    const css = extractCertifiedCss();
    const innerWidth = 860;
    const columnGap = 18;
    const sharedStart = sharedRightColumnStart(innerWidth, columnGap);
    const offsetStart = offsetCopyStart(innerWidth);

    expect(HOMEPAGE_OFFSET_COPY_RED_CSS).toContain(
      "data-deliberate-red='homepage-offset-copy'"
    );
    expect(HOMEPAGE_OFFSET_COPY_RED_CSS).toContain('margin-left: auto');
    expect(HOMEPAGE_OFFSET_COPY_RED_CSS).toContain('max-width: 34rem');
    expect(css).not.toMatch(/margin-left:\s*auto/);

    expect(sharedStart).toBeCloseTo(439, 0);
    expect(offsetStart).toBe(316);
    expect(sharedStart - offsetStart).toBeGreaterThan(80);

    const renderedRed = evaluateRelationalGrid(
      HOMEPAGE_OFFSET_COPY_RENDERED_RED
    );
    const renderedGreen = evaluateRelationalGrid(
      HOMEPAGE_SHARED_COLUMN_RENDERED_GREEN
    );
    expect(renderedRed.ok).toBe(false);
    expect(renderedRed.issues.map(issue => issue.rule)).toContain(
      'source-tokens-without-rendered-alignment'
    );
    expect(renderedGreen.ok).toBe(true);
    expect(
      evaluateAcceptanceEvidence(HOMEPAGE_SOURCE_ONLY_ACCEPTANCE_RED).ok
    ).toBe(false);
    expect(
      evaluateAcceptanceEvidence(HOMEPAGE_EXACT_CANDIDATE_ACCEPTANCE_GREEN).ok
    ).toBe(true);
  });

  it('does not change locked section ownership, copy, or media pairing', () => {
    const source = readFileSync(path.join(webRoot, sectionsPath), 'utf8');
    expect(source).toContain('HOMEPAGE_LAUNCH_COPY.certified');
    expect(source).toContain('PresenceSection');
    expect(source).toContain('StructureSection');
    expect(source).toContain(
      "<EditorialSection section={section} dataMedia='true'>"
    );
    expect(source).toContain(
      "<EditorialSection section={section} dataMedia='false'>"
    );
  });
});
