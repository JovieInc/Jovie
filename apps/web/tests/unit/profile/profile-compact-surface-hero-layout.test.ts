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
 * Public profile home hero has ONE definite token-driven height on every
 * viewport: h-(--cover-height) with --cover-height: clamp(220px, 34svh, 400px).
 * The old short-viewport shrink-wrap (flex-none + min-h-0 + ≤190px cap) made
 * the hero collapse to ~60px on viewports ≤820px tall, hiding the artist
 * photo and name — it must never come back. The carousel below the hero owns
 * the remaining viewport height.
 */
describe('ProfileCompactSurface home hero layout', () => {
  it('locks the home hero to the token-driven cover height (no flex/shrink-wrap)', () => {
    const contents = readFileSync(PROFILE_COMPACT_SURFACE, 'utf8');

    expect(contents).toMatch(/isHomeMode\s*\?\s*'h-\(--cover-height\) /);
    // The short-viewport shrink-wrap band must not come back.
    expect(contents).not.toMatch(/\[@media\(max-height:820px\)\]:flex-none/);
    expect(contents).not.toMatch(/\[@media\(max-height:820px\)\]:min-h-0/);
    expect(contents).not.toMatch(/\[@media\(max-height:820px\)\]:max-h-/);
    expect(contents).not.toMatch(/min-h-\(--cover-height\)\s+flex-1/);
    expect(contents).toMatch(
      /homeContentColumnClassName\s*=\s*'min-h-0 flex-1'/
    );
    expect(contents).toMatch(
      /homeContentScrollClassName\s*=\s*'min-h-0 flex-1'/
    );
  });

  it('uses ONE legibility gradient limited to the bottom of the hero', () => {
    const contents = readFileSync(PROFILE_COMPACT_SURFACE, 'utf8');

    // The stacked full-height scrim pair is replaced by a single class-driven
    // gradient; the fade layer is removed entirely.
    expect(contents).toMatch(/profile-cover-home-gradient/);
    expect(contents).not.toMatch(/profile-cover-home-fade/);
    expect(contents).not.toMatch(
      /profile-cover-home-gradient[^/]*bg-\[linear-gradient/
    );

    const css = readFileSync(DESIGN_SYSTEM, 'utf8');
    expect(css).toMatch(
      /\.profile-cover-home-gradient\)\s*\{[\s\S]{0,200}height:\s*55%/
    );
  });

  it('sets --cover-height to clamp(220px, 34svh, 400px) with no short-viewport override', () => {
    const contents = readFileSync(DESIGN_SYSTEM, 'utf8');

    const assignments = contents.match(
      /--cover-height:\s*clamp\(220px,\s*34svh,\s*400px\)/g
    );
    // :root and .profile-viewport both define the mobile value.
    expect(assignments?.length).toBeGreaterThanOrEqual(2);
    // No max-height media band may shrink the hero token anymore.
    expect(contents).not.toMatch(
      /max-height:\s*820px\)[\s\S]{0,120}--cover-height/
    );
    // Desktop compact shell keeps a proportional hero override (short
    // windows share shell height instead of crushing the carousel).
    expect(contents).toMatch(
      /\.public-profile-compact-shell\s*\{[\s\S]{0,400}--cover-height:\s*clamp\(200px,\s*45%,\s*340px\)/
    );
  });

  it('keeps the collapsed deep-link mode header behavior untouched', () => {
    const contents = readFileSync(DESIGN_SYSTEM, 'utf8');

    expect(contents).toMatch(
      /html\[data-profile-initial-mode\][\s\S]{0,200}--cover-height:\s*calc\(3\.5rem/
    );
  });
});
