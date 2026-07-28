import { describe, expect, it } from 'vitest';

import { PROFILE_Z } from '@/lib/profile/z-index-constants';
import { DRAWER_OVERLAY_CLASS } from './drawer-overlay-styles';

describe('drawer-overlay-styles', () => {
  it('uses a light flat dim so the mobile drawer remains crisp', () => {
    expect(DRAWER_OVERLAY_CLASS).toContain('bg-black/24');
  });

  it('does not blur the underlying profile', () => {
    expect(DRAWER_OVERLAY_CLASS).not.toContain('backdrop-blur');
    expect(DRAWER_OVERLAY_CLASS).toContain('bg-black/24');
  });

  it('overlay sits on the canonical drawer-backdrop layer below drawer content', () => {
    expect(DRAWER_OVERLAY_CLASS).toContain(PROFILE_Z.DRAWER_BACKDROP);
    expect(PROFILE_Z.DRAWER_BACKDROP).toBe('z-40');
    expect(PROFILE_Z.DRAWER_CONTENT).toBe('z-50');
  });

  it('overlay uses fixed positioning with full coverage', () => {
    expect(DRAWER_OVERLAY_CLASS).toContain('fixed');
    expect(DRAWER_OVERLAY_CLASS).toContain('inset-0');
  });
});
