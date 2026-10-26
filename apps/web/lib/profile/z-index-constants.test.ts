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

  // Semantic overlay order from tailwind-foundation.css: banner < sheet < modal.
  const SEMANTIC_ORDER = ['z-banner', 'z-sheet', 'z-modal'];
  const rank = (cls: string) => SEMANTIC_ORDER.indexOf(cls);

  it('keeps modal profile drawers above the cookie banner', () => {
    // Live bug 2026-10-26: banner covered the contact drawer at 390px.
    expect(rank(PROFILE_Z.COOKIE_BANNER)).toBeGreaterThanOrEqual(0);
    expect(rank(PROFILE_Z.MODAL_DRAWER_BACKDROP)).toBeGreaterThan(
      rank(PROFILE_Z.COOKIE_BANNER)
    );
    expect(rank(PROFILE_Z.MODAL_DRAWER_CONTENT)).toBeGreaterThan(
      rank(PROFILE_Z.COOKIE_BANNER)
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
