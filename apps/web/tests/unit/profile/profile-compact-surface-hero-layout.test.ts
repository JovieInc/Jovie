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
 * at a fixed --cover-height band (GitHub #11083).
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

  it('keeps short-viewport hero caps while the home rail flex-scrolls', () => {
    const contents = readFileSync(PROFILE_COMPACT_SURFACE, 'utf8');

    expect(contents).toMatch(/\[@media\(max-height:760px\)\]:flex-none/);
    expect(contents).toMatch(/\[@media\(max-height:760px\)\]:h-45/);
    expect(contents).toMatch(
      /homeContentColumnClassName\s*=\s*'min-h-0 flex-1'/
    );
    expect(contents).toMatch(
      /homeContentScrollClassName\s*=\s*'min-h-0 flex-1'/
    );
  });

  it('does not shrink the mid-height band hero via the removed 761-880 override', () => {
    const contents = readFileSync(DESIGN_SYSTEM, 'utf8');

    expect(contents).not.toMatch(
      /max-height:\s*880px\)\s*and\s*\(min-height:\s*761px\)/
    );
  });
});
