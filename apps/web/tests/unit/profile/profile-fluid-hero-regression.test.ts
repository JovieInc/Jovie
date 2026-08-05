import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const WEB_ROOT = process.cwd();
const SURFACE = join(
  WEB_ROOT,
  'components/features/profile/templates/ProfileCompactSurface.tsx'
);
const DESIGN_SYSTEM = join(WEB_ROOT, 'styles/design-system.css');

describe('public profile fluid home hero', () => {
  it('assigns spare compact-shell height to real hero media, never a spacer', () => {
    const surface = readFileSync(SURFACE, 'utf8');
    const css = readFileSync(DESIGN_SYSTEM, 'utf8');

    expect(surface).toContain('profile-home-fluid-hero min-h-0');
    expect(surface).toContain('profile-home-content-column pt-0');
    expect(surface).toContain('profile-home-content-scroll');
    expect(css).toMatch(
      /\.profile-home-fluid-hero[\s\S]{0,160}flex:\s*1 1 auto;[\s\S]{0,80}min-height:\s*var\(--cover-height\)/
    );
    expect(css).toMatch(
      /\.profile-home-content-column[\s\S]{0,360}flex:\s*0 0 auto/
    );
    expect(surface).not.toMatch(/profile-home-(?:spacer|filler)/);
  });

  it('keeps query-mode deep-link collapse authoritative on first paint', () => {
    const css = readFileSync(DESIGN_SYSTEM, 'utf8');

    expect(css).toMatch(
      /html\[data-profile-initial-mode\][\s\S]{0,300}\[data-testid="profile-cover"\][\s\S]{0,120}height:\s*calc\(3\.5rem/
    );
  });
});
