import { describe, expect, it } from 'vitest';

import { PROFILE_Z } from './z-index-constants';

describe('profile z-index constants', () => {
  it('exposes the canonical layering keys', () => {
    expect(Object.keys(PROFILE_Z)).toEqual([
      'LOCAL_CONTENT',
      'STICKY_CHROME',
      'EMBEDDED_MODAL',
      'DRAWER_BACKDROP',
      'DRAWER_CONTENT',
      'FULLSCREEN_FLOW',
    ]);
  });

  it('orders layers from low to high', () => {
    expect(PROFILE_Z.LOCAL_CONTENT).toBe('z-10');
    expect(PROFILE_Z.STICKY_CHROME).toBe('z-20');
    expect(PROFILE_Z.EMBEDDED_MODAL).toBe('z-30');
    expect(PROFILE_Z.DRAWER_BACKDROP).toBe('z-40');
    expect(PROFILE_Z.DRAWER_CONTENT).toBe('z-50');
  });

  it('keeps the full-screen flow above all drawers', () => {
    expect(PROFILE_Z.FULLSCREEN_FLOW).toBe('z-[140]');
  });
});
