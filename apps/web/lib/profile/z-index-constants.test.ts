import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
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
      'COOKIE_BANNER',
      'MODAL_DRAWER_BACKDROP',
      'MODAL_DRAWER_CONTENT',
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

  const zNum = (cls: string) => Number(/(\d+)\]?$/.exec(cls)?.[1]);

  it('keeps modal profile drawers above the cookie banner', () => {
    // Live bug 2026-10-26: banner covered the contact drawer at 390px.
    expect(zNum(PROFILE_Z.COOKIE_BANNER)).toBeLessThan(
      zNum(PROFILE_Z.MODAL_DRAWER_BACKDROP)
    );
    expect(zNum(PROFILE_Z.MODAL_DRAWER_BACKDROP)).toBeLessThan(
      zNum(PROFILE_Z.MODAL_DRAWER_CONTENT)
    );
    expect(zNum(PROFILE_Z.MODAL_DRAWER_CONTENT)).toBeLessThan(
      zNum(PROFILE_Z.FULLSCREEN_FLOW)
    );
  });

  it('wires the banner and the modal drawer shell to those layers', () => {
    const read = (rel: string) => readFileSync(resolve(__dirname, rel), 'utf8');
    expect(
      read('../../components/organisms/CookieBannerSection.tsx')
    ).toContain('PROFILE_Z.COOKIE_BANNER');
    const shell = read(
      '../../components/features/profile/ProfileDrawerShell.tsx'
    );
    expect(shell).toContain('PROFILE_Z.MODAL_DRAWER_BACKDROP');
    expect(shell).toContain('PROFILE_Z.MODAL_DRAWER_CONTENT');
  });
});
