import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * JOV-INV-012 exception: the Pen identity header composition (80px portrait,
 * name, handle, Listen action and socials above one mode card) is a founder
 * design invariant (identity/brand permanence, Tim 2026-09-26), not an
 * experiment arm. It supersedes the 34svh cover-photo hero control.
 * Public-profile conversion inventory below the header stays on existing
 * analytics (`profile_views`, `social_click`, `profile_tab_click`), PAC,
 * audience events, and release-to-revenue surfaces.
 */
export const PUBLIC_MOBILE_HERO_LAYOUT_OPTIMIZATION_EXCEPTION = {
  kind: 'non-optimizable',
  invariant: 'JOV-INV-012',
  justification:
    'The Pen identity header (80px portrait, name, handle, Listen action, socials) is the founder-approved public-mobile identity composition. It replaces the 34svh cover-photo hero as the control; it does not introduce a variant.',
  variantIdentity:
    'public-profile-compact-hero:identity-header-80px:control-v2',
  exposure:
    'Not an experiment exposure. Every public compact render uses the same identity header. Existing profile_views remains the page-level exposure on analytics.',
  outcome:
    'Artist-business outcomes on the public profile (listen/social/tip clicks, capture) stay on canonical metrics. Header geometry is not a treatment.',
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
    'Not an experiment. The Pen identity header plus one mode card is the control composition for 390x844 and other mobile viewports.',
  primaryMetric:
    'None for header geometry. Public-profile conversion continues to use canonical CTR / capture_rate from apps/web/lib/analytics/metrics.ts.',
  guardrails: [
    'Do not restore the full-bleed cover photo or put a gradient, overlay, or text over the portrait.',
    'Keep every identity control at a 44px hit area.',
    'Do not invent a parallel analytics stack or auto-promote header geometry.',
  ],
  privacyAndConsent:
    'Anonymous public-profile analytics only. No sensitive demographic inference. No consent-gated identity stitching.',
  optimizerOwner: 'Product',
  cadence:
    'No auto-optimization of header geometry. Re-evaluate only if the founder Pen profile design changes.',
  decisionWriteback:
    'Keep identity-header-80px as control. Challengers require a new variantIdentity and a design-invariant change, not an experiment arm.',
  rollbackOrControl:
    'Revert this branch to restore the prior cover-photo hero source.',
} as const;

const PROFILE_COMPACT_SURFACE = join(
  process.cwd(),
  'components',
  'features',
  'profile',
  'templates',
  'ProfileCompactSurface.tsx'
);
const PROFILE_IDENTITY_HEADER = join(
  process.cwd(),
  'components',
  'features',
  'profile',
  'ProfileIdentityHeader.tsx'
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

describe('ProfileCompactSurface identity header layout', () => {
  it('declares a justified non-optimizable JOV-INV-012 exception for the identity header', () => {
    expect(PUBLIC_MOBILE_HERO_LAYOUT_OPTIMIZATION_EXCEPTION).toMatchObject({
      kind: 'non-optimizable',
      invariant: 'JOV-INV-012',
      variantIdentity:
        'public-profile-compact-hero:identity-header-80px:control-v2',
      optimizerOwner: 'Product',
    });
    expect(
      PUBLIC_MOBILE_HERO_LAYOUT_OPTIMIZATION_EXCEPTION.primaryMetric
    ).toMatch(/metrics\.ts/);
    expect(
      PUBLIC_MOBILE_HERO_LAYOUT_OPTIMIZATION_EXCEPTION.rollbackOrControl
    ).toMatch(/Revert/);
  });

  it('renders one identity header for every mode instead of a cover-photo hero', () => {
    const surface = readFileSync(PROFILE_COMPACT_SURFACE, 'utf8');

    expect(surface.match(/<ProfileIdentityHeader\b/g)).toHaveLength(1);
    expect(surface).not.toContain('h-(--cover-height)');
    expect(surface).not.toContain('profile-home-fluid-hero');
    expect(surface).not.toContain('profile-cover-home-gradient');
    // The chrome floats over the header and never blocks it.
    expect(surface).toContain(
      "'profile-cover-chrome pointer-events-none absolute inset-x-0 top-0 z-20"
    );
  });

  it('keeps the portrait art untouched: 80px circle, no overlay but the verified glyph', () => {
    const header = readFileSync(PROFILE_IDENTITY_HEADER, 'utf8');

    expect(header).toContain("'relative h-20 w-20 shrink-0'");
    expect(header).toContain('overflow-hidden rounded-full');
    expect(header).toContain("sizes='80px'");
    expect(header).not.toMatch(/gradient|backdrop-blur|bg-black\//);
  });

  it('keeps every identity control on a 44px hit area with a 28px Listen face', () => {
    const header = readFileSync(PROFILE_IDENTITY_HEADER, 'utf8');

    expect(header).toContain(
      'inline-flex h-11 w-11 shrink-0 touch-manipulation'
    );
    expect(header).toContain(
      "'group flex h-11 min-w-0 flex-1 touch-manipulation items-center"
    );
    expect(header).toContain(
      "'profile-glass-pill profile-glass-pill--flat flex h-7 w-full"
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

  it('reserves the floating dock outside the scroll box at every viewport (JOV-7192)', () => {
    const contents = readFileSync(DESIGN_SYSTEM, 'utf8');

    // The reservation must live at top level, not inside the max-width media
    // block: on the fixed-height desktop shell the dock otherwise covers the
    // last card at rest even though it can technically scroll into view.
    const declaration = 'margin-bottom: var(--profile-bottom-nav-height);';
    const declarationIndex = contents.indexOf(declaration);
    expect(declarationIndex).toBeGreaterThan(-1);
    const lastMedia = contents.lastIndexOf('@media', declarationIndex);
    const lastTopLevelClose = contents.lastIndexOf('\n}', declarationIndex);
    expect(lastMedia).toBeLessThan(lastTopLevelClose);
    // Embedded previews render no dock, so they keep the in-box padding.
    const ruleStart = contents.lastIndexOf(':where(', declarationIndex);
    expect(contents.slice(ruleStart, declarationIndex)).toContain(
      'data-presentation="embedded"'
    );
  });

  it('preserves the landscape track minimum when identity text consumes the viewport', () => {
    const contents = readFileSync(DESIGN_SYSTEM, 'utf8');

    // JOV-6535: a compressed track with overflow-y-hidden clips the card's
    // action without ever growing the scroll region's scrollHeight, so the
    // overflow-scroll mode never engages and the action is unreachable.
    expect(contents).toMatch(
      /\.profile-horizontal-rail\[data-layout="profile-landscape"\]\s*\{[^}]*height:\s*auto;[^}]*min-height:\s*max-content;[^}]*flex-shrink:\s*0/
    );
  });

  it('eagerly loads the first visible artwork without loading two hero images', () => {
    const contents = readFileSync(PROFILE_COMPACT_SURFACE, 'utf8');

    expect(contents).toMatch(
      /<ProfileHomeRail[\s\S]{0,900}pacArtPriority=\{!resolvedHeroImageUrl\}/
    );
  });
});
