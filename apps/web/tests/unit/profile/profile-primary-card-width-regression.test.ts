import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const HOME_RAIL = readFileSync(
  join(process.cwd(), 'components/features/profile/ProfileHomeRail.tsx'),
  'utf8'
);
const CAROUSEL = readFileSync(
  join(process.cwd(), 'components/organisms/entity-card/EntityCarousel.tsx'),
  'utf8'
);

describe('public profile primary card width', () => {
  it('lets the home rail own the full canonical content width', () => {
    expect(HOME_RAIL).toContain(
      "className='flex min-h-0 min-w-0 flex-1 flex-col md:mx-auto md:w-full'"
    );
    expect(HOME_RAIL).not.toMatch(/profile-home-rail[\s\S]{0,220}max-w-80/);
  });

  it('keeps every multi-card footprint full-width and one snap per page', () => {
    expect(CAROUSEL).toContain("isProfileLandscape && 'w-full'");
    expect(CAROUSEL).toContain('snap-start snap-always');
    expect(CAROUSEL).toContain("'gap-(--page-pad) md:gap-4'");
  });
});
