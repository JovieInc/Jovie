import { describe, expect, it } from 'vitest';

import { DRAWER_OVERLAY_CLASS } from './drawer-overlay-styles';

describe('drawer-overlay-styles', () => {
  it('overlay includes 60% black opacity for sufficient backdrop coverage', () => {
    expect(DRAWER_OVERLAY_CLASS).toContain('bg-black/60');
  });

  it('overlay includes backdrop blur', () => {
    expect(DRAWER_OVERLAY_CLASS).toContain('backdrop-blur-sm');
  });

  it('overlay uses z-40 to sit below drawer content (z-50)', () => {
    expect(DRAWER_OVERLAY_CLASS).toContain('z-40');
  });

  it('overlay uses fixed positioning with full coverage', () => {
    expect(DRAWER_OVERLAY_CLASS).toContain('fixed');
    expect(DRAWER_OVERLAY_CLASS).toContain('inset-0');
  });
});
