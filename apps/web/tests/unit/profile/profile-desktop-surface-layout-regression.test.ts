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

  // jov.ie/tim at 1440px: the Get-updates/Payments rail painted over the
  // Selected-work/Events cards. The card stacks were bare `grid` containers,
  // so each had one implicit `auto` track. An auto track is at least as wide
  // as its widest item's min-content, and `truncate` text is nowrap, so the
  // track grew to the longest untruncated release title (390px inside a 312px
  // overview column) and the cards spilled under the next column. min-w-0 on
  // the stack only shrinks the stack's own box, not the track inside it.
  // grid-cols-1 is minmax(0,1fr): the track is the column and text truncates.
  it('gives every overview card stack an explicit minmax(0,1fr) column', () => {
    const source = readFileSync(SURFACE_SOURCE, 'utf8');
    for (const stack of [
      "className='grid min-h-0 min-w-0 grid-cols-1 gap-3.5 [@media(min-width:1180px)]:contents'",
      "className='grid min-h-0 min-w-0 grid-cols-1 content-start gap-3.5 [@media(min-width:1180px)]:col-start-2 [@media(min-width:1180px)]:row-start-1'",
      "'min-h-0 min-w-0 grid-cols-1 gap-3.5',",
    ]) {
      expect(source).toContain(stack);
    }
    // Cards are grid items in every stack (home overview and listen DSP
    // column): min-w-0 stops their content from setting a track's floor.
    expect(source).toContain(
      "'min-w-0 rounded-2xl border border-white/6 bg-white/[0.025] p-5'"
    );
  });
});
