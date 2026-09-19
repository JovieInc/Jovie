import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * JOV-INV-012 exception: the tokenized 34svh cover-height composition is a
 * design invariant (identity/brand permanence), not an experiment arm.
 * Public-profile conversion inventory below the hero stays on existing
 * analytics (`profile_views`, `social_click`, `profile_tab_click`), PAC,
 * audience events, and release-to-revenue surfaces.
 */
export const PUBLIC_MOBILE_HERO_LAYOUT_OPTIMIZATION_EXCEPTION = {
  kind: 'non-optimizable',
  invariant: 'JOV-INV-012',
  justification:
    'clamp(220px, 34svh, 400px) is the tokenized public-mobile hero geometry. Auto-promoting a challenger height would fight DESIGN.md and the layout contract tests. This PR restores that control; it does not introduce a variant.',
  variantIdentity: 'public-profile-compact-hero:cover-height-34svh:control-v1',
  exposure:
    'Not an experiment exposure. Every public compact home render uses the same --cover-height token. Existing profile_views remains the page-level exposure on analytics.',
  outcome:
    'Artist-business outcomes on the public profile (listen/social/tip clicks, capture) stay on canonical metrics. Hero height is not a treatment.',
  attribution: {
    surfaces: [
      'analytics',
      'model-experiments',
      'audience-events',
      'youtube-experiments',
      'release-to-revenue',
    ],
    existingEvents: ['profile_views', 'profile_tab_click', 'social_click'],
  },
  eligibleContextDimensions: [
    'platform',
    'medium-or-channel',
    'country-or-locale',
    'artist-plus-career-era',
  ],
  hypothesis:
    'Not an experiment. The approved 34svh media slot plus in-flow identity band is the control composition for 390x844 and other tall mobile viewports.',
  primaryMetric:
    'None for hero height. Public-profile conversion continues to use canonical CTR / capture_rate from apps/web/lib/analytics/metrics.ts.',
  guardrails: [
    'Do not restore short-viewport shrink-wrap (max-height:820px flex-none / min-h-0 / cover-height override).',
    'Do not restyle IconButton; pearlQuiet owns top-chrome appearance.',
    'Do not invent a parallel analytics stack or auto-promote cover-height.',
  ],
  privacyAndConsent:
    'Anonymous public-profile analytics only. No sensitive demographic inference. No consent-gated identity stitching.',
  optimizerOwner: 'Product',
  cadence:
    'No auto-optimization of hero geometry. Re-evaluate only if DESIGN.md changes the cover-height token.',
  decisionWriteback:
    'Keep cover-height-34svh as control. Write decisions back on JOV-6254. Challengers require a new variantIdentity and a design-invariant change, not an experiment arm.',
  rollbackOrControl:
    'Revert this branch to restore the prior compact-hero source. The tokenized 34svh control remains the intended composition.',
} as const;

const PROFILE_COMPACT_SURFACE = join(
  process.cwd(),
  'components',
  'features',
  'profile',
  'templates',
  'ProfileCompactSurface.tsx'
);
const DESIGN_SYSTEM = join(process.cwd(), 'styles', 'design-system.css');
const PROFILE_MOBILE_OVERFLOW = join(
  process.cwd(),
  'components',
  'features',
  'profile',
  'templates',
  'useProfileMobileOverflow.ts'
);

/**
 * Public profile home hero with real artwork has ONE definite token-driven
 * height on every viewport: h-(--cover-height) with
 * --cover-height: clamp(220px, 34svh, 400px). Profiles without real artwork
 * use the compact no-media geometry so an empty decorative field cannot crowd
 * the conversion inventory below it.
 * The old short-viewport shrink-wrap (flex-none + min-h-0 + ≤190px cap) made
 * the hero collapse to ~60px on viewports ≤820px tall, hiding the artist
 * photo and name — it must never come back. The carousel below the hero owns
 * the remaining viewport height.
 */
describe('ProfileCompactSurface home hero layout', () => {
  it('declares a justified non-optimizable JOV-INV-012 exception for cover-height', () => {
    expect(PUBLIC_MOBILE_HERO_LAYOUT_OPTIMIZATION_EXCEPTION).toMatchObject({
      kind: 'non-optimizable',
      invariant: 'JOV-INV-012',
      variantIdentity:
        'public-profile-compact-hero:cover-height-34svh:control-v1',
      optimizerOwner: 'Product',
    });
    expect(
      PUBLIC_MOBILE_HERO_LAYOUT_OPTIMIZATION_EXCEPTION.justification
    ).toMatch(/34svh/);
    expect(
      PUBLIC_MOBILE_HERO_LAYOUT_OPTIMIZATION_EXCEPTION.attribution.surfaces
    ).toEqual([
      'analytics',
      'model-experiments',
      'audience-events',
      'youtube-experiments',
      'release-to-revenue',
    ]);
    expect(
      PUBLIC_MOBILE_HERO_LAYOUT_OPTIMIZATION_EXCEPTION.primaryMetric
    ).toMatch(/metrics\.ts/);
    expect(
      PUBLIC_MOBILE_HERO_LAYOUT_OPTIMIZATION_EXCEPTION.rollbackOrControl
    ).toMatch(/Revert/);
  });

  it('locks the home hero to the token-driven cover height (no flex/shrink-wrap)', () => {
    const contents = readFileSync(PROFILE_COMPACT_SURFACE, 'utf8');

    expect(contents).toMatch(
      /isHomeMode[\s\S]{0,120}resolvedHeroImageUrl[\s\S]{0,80}'h-\(--cover-height\) shrink-0'[\s\S]{0,80}'profile-home-fluid-hero--no-media shrink-0'/
    );
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
    expect(contents).not.toContain(
      'profile-top-chrome-icon text-white dark:text-white'
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

  it('keeps the mobile media token additive to identity and reserves the dock', () => {
    const contents = readFileSync(DESIGN_SYSTEM, 'utf8');

    // The media slot owns the token; the in-flow identity band is additive.
    // The browser layout suite proves the resulting geometry and composition.
    expect(contents).toMatch(
      /@media \(max-width: 767px\)[\s\S]*?\.profile-home-fluid-hero[\s\S]*?flex:\s*0 0 auto;[\s\S]*?height:\s*auto;[\s\S]*?min-height:\s*calc\([\s\S]*?var\(--cover-height\)\s*\+\s*var\(--profile-hero-identity-min-height\)[\s\S]*?\);/
    );
    expect(contents).toMatch(
      /@media \(max-width: 767px\)[\s\S]*?\.profile-cover-home-media[\s\S]*?flex:\s*0 0 var\(--cover-height\);[\s\S]*?height:\s*var\(--cover-height\);/
    );
    expect(contents).toMatch(
      /@media \(max-width: 767px\)[\s\S]*?\.profile-home-content-column[\s\S]*?flex:\s*1 1 0%;[\s\S]*?min-height:\s*0;[\s\S]*?margin-bottom:\s*var\(--profile-bottom-nav-height\);/
    );
    expect(contents).toMatch(
      /@media \(max-width: 767px\)[\s\S]*?profile-home-rail[\s\S]*?justify-content:\s*flex-start;[\s\S]*?\[data-testid="profile-compact-surface"\][\s\S]*?\.profile-home-content-scroll\s*\{\s*padding-bottom:\s*0;/
    );
  });

  it('lets oversized mobile identity content scroll the primary action above the dock', () => {
    const contents = readFileSync(DESIGN_SYSTEM, 'utf8');
    const sourceContents = readFileSync(PROFILE_COMPACT_SURFACE, 'utf8');
    const overflowSourceContents = readFileSync(
      PROFILE_MOBILE_OVERFLOW,
      'utf8'
    );
    const template = readFileSync(
      join(
        process.cwd(),
        'components',
        'features',
        'profile',
        'templates',
        'ProfileCompactTemplate.tsx'
      ),
      'utf8'
    );

    expect(template).toContain(
      "className='profile-compact-surface-slot relative min-h-0 flex-1'"
    );
    expect(contents).toMatch(
      /\.profile-viewport:not\(\.profile-viewport--embedded\):has\([\s\S]*?data-profile-overflow-mode="scroll"[\s\S]*?\)\s*\{[\s\S]*?overflow-y:\s*auto;/
    );
    expect(overflowSourceContents).toContain(
      'window.matchMedia(PROFILE_MOBILE_MEDIA_QUERY)'
    );
    expect(overflowSourceContents).toContain(
      "const PROFILE_MOBILE_MEDIA_QUERY = '(max-width: 767px)'"
    );
    expect(sourceContents).toContain(
      "data-profile-home-mode={isHomeMode ? 'true' : undefined}"
    );
    expect(overflowSourceContents).toContain(
      'setOverflowMode(surface.scrollHeight > surface.clientHeight + 1)'
    );
    expect(overflowSourceContents).toContain('overflowProbeFrameRef');
    expect(contents).toMatch(
      /data-profile-overflow-mode="scroll"\]\[data-profile-home-mode="true"\]/
    );
    expect(contents).toMatch(
      /\.profile-compact-surface-slot\s*\{[\s\S]*?height:\s*auto;[\s\S]*?flex:\s*1 0 auto;/
    );
    expect(contents).toMatch(
      /\.profile-home-content-scroll\s*\{[\s\S]*?overflow:\s*visible;[\s\S]*?padding-bottom:\s*var\(--profile-bottom-nav-height\);/
    );
    expect(contents).toMatch(
      /\.profile-viewport:not\(\.profile-viewport--embedded\):has\([\s\S]*?data-profile-overflow-mode="scroll"[\s\S]*?\)\s+\.profile-floating-tab-bar\s*\{\s*position:\s*fixed;/
    );

    expect(readFileSync(PROFILE_COMPACT_SURFACE, 'utf8')).toContain(
      'data-profile-overflow-mode'
    );
  });

  it('keeps the collapsed deep-link mode header behavior untouched', () => {
    const contents = readFileSync(DESIGN_SYSTEM, 'utf8');

    expect(contents).toMatch(
      /html\[data-profile-initial-mode\][\s\S]{0,200}--cover-height:\s*calc\(3\.5rem/
    );
  });

  it('eagerly loads the first visible artwork without loading two hero images', () => {
    const contents = readFileSync(PROFILE_COMPACT_SURFACE, 'utf8');

    expect(contents).toMatch(
      /<ProfileHomeRail[\s\S]{0,900}pacArtPriority=\{!resolvedHeroImageUrl\}/
    );
  });
});
