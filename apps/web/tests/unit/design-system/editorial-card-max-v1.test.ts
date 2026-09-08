import { basename } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  collectWebProductSource,
  formatViolations,
  jsxOpenings,
  read,
  repoPath,
  type Violation,
} from './blocking-ui-invariants';

/**
 * editorial-card-max-v1 (Tim lock 2026-08-30,
 * gbrain ops/reviewed-invariants/blocking-ui-invariants-v1).
 *
 * Editorial card max: optional eyebrow + one heading + one subheading +
 * one visual + one CTA. No 30-line bodies. No stacked extra sections.
 *
 * Detector (source contract, fail closed): an editorial surface is any
 * product component that renders an eyebrow and is card/hero/pane-shaped
 * (filename contains Card / Hero / Pane / Intro — the editorial register in
 * this codebase always ships the eyebrow with that shape). Per surface:
 *
 *   - headings   ≤ 1  (one heading; the subheading is a paragraph)
 *   - paragraphs ≤ 1  (one subheading — stacked paragraph bodies are the
 *                      "30-line body" failure class)
 *   - <section>  ≤ 1  (no stacked extra sections inside the card)
 *   - CTA        ≤ 1  (one Button-family CTA)
 *   - no single contiguous JSX text body spanning ≥ 30 source lines
 *
 * No baseline, no allowlist. Violations are red until the screens are fixed
 * in follow-up PRs.
 */

const EDITORIAL_SHAPE = /(Card|Hero|Pane|Intro)/;
const EYEBROW = /eyebrow/i;
const HEADING = /h[1-6]/;
const PARAGRAPH = /p/;
const SECTION = /section/;
const CTA = /(?:[A-Za-z][\w.]*)?Button/;
const BODY_BLOCK = /<p\b[^]*?<\/p>/g;

describe('editorial-card-max-v1', () => {
  it('keeps editorial cards inside the canonical anatomy', () => {
    const files = collectWebProductSource().filter(
      file => EDITORIAL_SHAPE.test(basename(file)) && EYEBROW.test(read(file))
    );
    expect(
      files.length,
      'zero editorial (eyebrow-bearing) card surfaces found — detector is blind, failing closed'
    ).toBeGreaterThan(0);

    const violations: Violation[] = [];
    for (const file of files) {
      const source = read(file);
      const problems: string[] = [];

      const headings = jsxOpenings(source, HEADING).filter(o =>
        /^h[1-6]$/.test(o.tag)
      ).length;
      if (headings > 1) problems.push(`${headings} headings (max 1)`);

      const paragraphs = jsxOpenings(source, PARAGRAPH).filter(
        o => o.tag === 'p'
      ).length;
      if (paragraphs > 1) {
        problems.push(`${paragraphs} body paragraphs (max 1 subheading)`);
      }

      const sections = jsxOpenings(source, SECTION).filter(
        o => o.tag === 'section'
      ).length;
      if (sections > 1) {
        problems.push(`${sections} stacked <section> blocks (max 1)`);
      }

      const ctas = jsxOpenings(source, CTA).length;
      if (ctas > 1) problems.push(`${ctas} Button-family CTAs (max 1)`);

      for (const block of source.match(BODY_BLOCK) ?? []) {
        const span = block.split('\n').length;
        if (span >= 30) {
          problems.push(`body block spans ${span} source lines (banned)`);
          break;
        }
      }

      if (problems.length > 0) {
        violations.push({
          file: repoPath(file),
          detail: problems.join('; '),
        });
      }
    }

    expect
      .soft(violations, formatViolations('editorial-card-max-v1', violations))
      .toEqual([]);
    expect(violations).toHaveLength(0);
  });
});
