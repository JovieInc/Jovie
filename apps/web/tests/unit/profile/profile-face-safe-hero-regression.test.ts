import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const WEB_ROOT = process.cwd();
const SURFACE = readFileSync(
  join(
    WEB_ROOT,
    'components/features/profile/templates/ProfileCompactSurface.tsx'
  ),
  'utf8'
);
const CSS = readFileSync(join(WEB_ROOT, 'styles/design-system.css'), 'utf8');

describe('public profile face-safe hero composition', () => {
  it('keeps identity on a separate stage band with no media blur', () => {
    expect(SURFACE).toContain(
      'profile-hero-identity-scrim relative z-10 shrink-0'
    );
    expect(SURFACE).not.toMatch(
      /profile-hero-identity-scrim[^']*backdrop-blur/
    );
    expect(CSS).toMatch(
      /\.profile-hero-identity-scrim\)[\s\S]{0,160}background:\s*var\(--profile-stage-bg\)/
    );
  });

  it('limits the media edge transition to one spacing token', () => {
    expect(SURFACE).toContain(
      'profile-cover-home-gradient--face-safe pointer-events-none'
    );
    expect(CSS).toMatch(
      /\.profile-cover-home-gradient--face-safe\)[\s\S]{0,180}height:\s*var\(--space-8\)/
    );
  });

  it('applies only the validated object-position result', () => {
    expect(SURFACE).toContain(
      'resolvePublicHeroObjectPosition(artist.settings)'
    );
    expect(SURFACE).toContain('style={{ objectPosition: heroObjectPosition }}');
    expect(SURFACE).not.toContain('object-[50%_20%]');
  });
});
