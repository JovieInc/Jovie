import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

// JOV-11623 regression: the home-overview grid lives inside the scrolling
// profile-desktop-content-scroll pane, so it must size to its own content.
// flex-1 (and even default flex-shrink with min-h-0) squeezed the grid box
// to the pane's viewport height, and the taller Events column then painted
// past the box over the footer branding — white venue ink directly behind
// the "Made with Jovie" glyphs, which the image-contrast detector correctly
// flagged. The branding keeps its short-content bottom-of-fold pinning via
// mt-auto instead of the overview's stretch.
const SURFACE_SOURCE = resolve(
  process.cwd(),
  'components/features/profile/templates/ProfileDesktopSurface.tsx'
);

describe('ProfileDesktopSurface layout contract', () => {
  it('sizes the home overview to its content and pins the branding clear of it (JOV-11623)', () => {
    const source = readFileSync(SURFACE_SOURCE, 'utf8');
    expect(source).toContain("'grid min-h-0 min-w-0 flex-none gap-4'");
    expect(source).not.toContain("'grid min-h-0 min-w-0 flex-1 gap-4'");
    expect(source).toContain("'mt-auto flex justify-center pb-1 pt-2'");
  });
});
