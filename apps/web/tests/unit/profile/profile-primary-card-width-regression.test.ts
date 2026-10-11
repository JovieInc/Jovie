import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const HOME_RAIL = readFileSync(
  join(process.cwd(), 'components/features/profile/ProfileHomeRail.tsx'),
  'utf8'
);

describe('public profile primary card width', () => {
  it('lets the home rail own the full canonical content width', () => {
    expect(HOME_RAIL).toContain(
      "className='flex min-h-0 min-w-0 flex-1 flex-col gap-4 md:mx-auto md:w-full'"
    );
    expect(HOME_RAIL).not.toMatch(/profile-home-rail[\s\S]{0,220}max-w-80/);
  });

  // JOV-7123: the featured editorial card replaces the highlights carousel —
  // the home rail must not stack a second card surface under the PAC.
  it('renders one card surface — the featured PAC, never a carousel', () => {
    expect(HOME_RAIL).toContain('ProfilePacCard');
    expect(HOME_RAIL).not.toContain('ReleaseCatalogCarousel');
    expect(HOME_RAIL).not.toContain('EntityCarousel');
    expect(HOME_RAIL).not.toContain('profile-home-carousel');
  });
});
