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
const PROFILE_MOBILE_NOTIFICATIONS_FLOW = join(
  process.cwd(),
  'components',
  'features',
  'profile',
  'artist-notifications-cta',
  'ProfileMobileNotificationsFlow.tsx'
);

describe('ProfileCompactSurface subscribe composition', () => {
  it('renders one notification flow when the subscribe tab is active', () => {
    const contents = readFileSync(PROFILE_COMPACT_SURFACE, 'utf8');

    expect(contents).toMatch(
      /shouldRenderInteractiveOverlays\s*&&\s*activeVisiblePrimaryTab\s*!==\s*'subscribe'/
    );
    expect(contents).not.toMatch(
      /autoOpen=\{activeVisiblePrimaryTab === 'subscribe'\}/
    );
  });

  it('sizes the inline flow from the available panel height', () => {
    const contents = readFileSync(PROFILE_MOBILE_NOTIFICATIONS_FLOW, 'utf8');

    expect(contents).toMatch(/relative flex h-full min-h-full flex-1 flex-col/);
    expect(contents).not.toMatch(/relative min-h-150/);
    expect(contents).not.toMatch(/touch-action:pan-y/);
  });
});
