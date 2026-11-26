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
const DESIGN_SYSTEM_CSS = resolve(process.cwd(), 'styles/design-system.css');

describe('ProfileDesktopSurface layout contract', () => {
  it('sizes the home overview to its content and pins the branding clear of it (JOV-11623)', () => {
    const source = readFileSync(SURFACE_SOURCE, 'utf8');
    expect(source).toContain("'grid min-h-0 min-w-0 flex-none gap-4'");
    expect(source).not.toContain("'grid min-h-0 min-w-0 flex-1 gap-4'");
    // The branding follows the content: mt-auto pinned it to the bottom of
    // the fold and left a 270px empty band under short tabs like About
    // (viewport sweep, 1200-1440px).
    expect(source).toContain("'flex justify-center pb-1 pt-2'");
    expect(source).not.toContain("'mt-auto flex justify-center pb-1 pt-2'");
  });

  // Same JOV-11623 failure on the Music tab: a flex-1 + min-h-0 listen grid
  // shrank to the pane height and the DSP column's "Listen on" links painted
  // below "Made with Jovie" (viewport sweep, claimed profile 1200-1440px).
  it('sizes the listen grid to its content', () => {
    const source = readFileSync(SURFACE_SOURCE, 'utf8');
    const listenGrid = source.match(
      /PROFILE_LISTEN_DESKTOP_GRID_CLASSNAME =\n {2}'([^']+)'/
    )?.[1];
    expect(listenGrid).toContain('flex-none');
    expect(listenGrid?.split(' ')).not.toContain('flex-1');
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
      "'min-h-0 min-w-0 grid-cols-1 content-start gap-3.5',",
    ]) {
      expect(source).toContain(stack);
    }
    // Cards are grid items in every stack (home overview and listen DSP
    // column): min-w-0 stops their content from setting a track's floor.
    expect(source).toContain(
      "'min-w-0 rounded-2xl border border-white/6 bg-white/[0.025] p-5'"
    );
  });

  it('caps desktop home overview rows, empty-state floor, and shell height so Events never clips at 1280x720 and matches Pen D9kdx aspect at 1440x900', () => {
    const source = readFileSync(SURFACE_SOURCE, 'utf8');
    const css = readFileSync(DESIGN_SYSTEM_CSS, 'utf8');

    expect(source).toContain('visibleReleases.slice(0, 3)');
    expect(source).not.toContain('visibleReleases.slice(0, 4)');
    expect(source).toContain('upcomingTourDates.slice(0, 2)');
    expect(source).not.toContain('upcomingTourDates.slice(0, 5)');
    expect(source).toContain('flex min-h-14 items-center rounded-2xl');
    expect(source).not.toContain('flex min-h-30 items-center rounded-2xl');

    expect(css).toContain('height: min(780px, calc(100dvh - 48px));');
    expect(css).not.toContain('height: min(940px, calc(100dvh - 48px));');

    // Pen D9kdx is 1298x750; at 1440x900 .profile-desktop-surface is 1234x780.
    const penAspect = 750 / 1298;
    const renderAspect = 780 / 1234;
    expect(Math.abs(renderAspect / penAspect - 1)).toBeLessThanOrEqual(0.15);
  });
});
