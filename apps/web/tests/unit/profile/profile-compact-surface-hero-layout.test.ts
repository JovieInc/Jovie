import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const PROFILE_COMPACT_SURFACE = join(
  process.cwd(),
  'components',
  'features',
  'profile',
  'templates',
  'ProfileCompactSurface.tsx'
);
const DESIGN_SYSTEM = join(process.cwd(), 'styles', 'design-system.css');

/**
 * Public profile home hero must flex-grow on tall viewports instead of capping
 * at a fixed --cover-height band (GitHub #11083), and must never shrink below
 * the 240px composition floor (GitHub #11899 — hero has priority: crop, never
 * squash; content below the hero scrolls instead).
 */
describe('ProfileCompactSurface home hero layout', () => {
  it('grows the home hero with flex-1 and a min-height floor', () => {
    const contents = readFileSync(PROFILE_COMPACT_SURFACE, 'utf8');

    expect(contents).toMatch(/min-h-\[var\(--cover-height\)\]/);
    expect(contents).toMatch(/\bflex-1\b/);
    expect(contents).not.toMatch(/\bmax-h-108\b/);
    expect(contents).not.toMatch(
      /isHomeMode\s*\?\s*'h-\[var\(--cover-height\)\]'/
    );
  });

  it('locks short viewports to the 240px composition floor, never below', () => {
    const contents = readFileSync(PROFILE_COMPACT_SURFACE, 'utf8');

    expect(contents).toMatch(/\[@media\(max-height:760px\)\]:flex-none/);
    expect(contents).toMatch(/\[@media\(max-height:760px\)\]:min-h-60/);
    expect(contents).toMatch(/\[@media\(max-height:760px\)\]:max-h-60/);
    // The pre-composition 180px squish band (#11899) must not come back.
    expect(contents).not.toMatch(/\[@media\(max-height:760px\)\]:h-45\b/);
    expect(contents).not.toMatch(/\[@media\(max-height:760px\)\]:max-h-45\b/);
    expect(contents).toMatch(
      /homeContentColumnClassName\s*=\s*'min-h-0 flex-1'/
    );
    expect(contents).toMatch(
      /homeContentScrollClassName\s*=\s*'min-h-0 flex-1'/
    );
  });

  it('keeps every fixed --cover-height value at or above the 240px hero floor', () => {
    const contents = readFileSync(DESIGN_SYSTEM, 'utf8');

    // Fixed px assignments only — clamp()/calc() bands have their own floors
    // (the calc(3.5rem…) value is the collapsed non-home mode header, where
    // hero media is display:none, not a hero band).
    const fixedCoverHeights = [
      ...contents.matchAll(/--cover-height:\s*(\d+(?:\.\d+)?)px\s*;/g),
    ].map(match => Number(match[1]));

    expect(fixedCoverHeights.length).toBeGreaterThan(0);
    for (const value of fixedCoverHeights) {
      expect(
        value,
        `--cover-height: ${value}px is below the 240px composition floor (#11899)`
      ).toBeGreaterThanOrEqual(240);
    }
  });

  it('does not shrink the mid-height band hero via the removed 761-880 override', () => {
    const contents = readFileSync(DESIGN_SYSTEM, 'utf8');

    expect(contents).not.toMatch(
      /max-height:\s*880px\)\s*and\s*\(min-height:\s*761px\)/
    );
  });
});
