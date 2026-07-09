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
 * at a fixed --cover-height band (GitHub #11083). On short viewports
 * (height ≤820px, iPhone SE class) it must compress to ≤190px so the bento
 * release card stays above the fold (profile-mobile-viewport-stability).
 * Media crops via object-cover — never the old 180px squish band (#11899).
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

  it('locks short viewports (≤820px tall) to a 190px hero cap for the bento fold', () => {
    const contents = readFileSync(PROFILE_COMPACT_SURFACE, 'utf8');

    expect(contents).toMatch(/\[@media\(max-height:820px\)\]:flex-none/);
    expect(contents).toMatch(/\[@media\(max-height:820px\)\]:max-h-\[190px\]/);
    // The pre-composition 180px squish band (#11899) must not come back.
    expect(contents).not.toMatch(/\[@media\(max-height:760px\)\]:h-45\b/);
    expect(contents).not.toMatch(/\[@media\(max-height:760px\)\]:max-h-45\b/);
    expect(contents).not.toMatch(/\[@media\(max-height:820px\)\]:h-45\b/);
    expect(contents).toMatch(
      /homeContentColumnClassName\s*=\s*'min-h-0 flex-1'/
    );
    expect(contents).toMatch(
      /homeContentScrollClassName\s*=\s*'min-h-0 flex-1'/
    );
  });

  it('sets the short-viewport --cover-height token to 190px (not the old 240px band)', () => {
    const contents = readFileSync(DESIGN_SYSTEM, 'utf8');

    expect(contents).toMatch(
      /max-height:\s*820px\)[\s\S]{0,120}--cover-height:\s*190px/
    );
    // Collapsed non-home mode uses calc(3.5rem…) with hero media hidden —
    // fixed px short-viewport band is the only compact home hero assignment.
    expect(contents).not.toMatch(
      /max-height:\s*820px\)[\s\S]{0,120}--cover-height:\s*240px/
    );
  });

  it('does not shrink the mid-height band hero via the removed 761-880 override', () => {
    const contents = readFileSync(DESIGN_SYSTEM, 'utf8');

    expect(contents).not.toMatch(
      /max-height:\s*880px\)\s*and\s*\(min-height:\s*761px\)/
    );
  });
});
