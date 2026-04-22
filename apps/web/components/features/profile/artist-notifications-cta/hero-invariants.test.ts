import { describe, expect, it } from 'vitest';
import {
  profileHeroMorphPillClassName,
  subscriptionHeroComposerSurfaceClassName,
  subscriptionHeroInputClassName,
  subscriptionHeroSubmitClassName,
} from './shared';

/**
 * Pearl-Notify hero morph bar — design invariant.
 *
 * Every step (cta / email / otp / name / birthday / done) must render inside
 * the same 44px dark-glass pill so the flow has zero layout shift. If any of
 * these shells stops being 44px, or the submit button stops fitting, we
 * regress to the "DOB escapes the boundary" bug the user flagged in QA.
 */
describe('Pearl-Notify hero morph bar invariants', () => {
  it('collapsed pill is 44px tall (h-11)', () => {
    expect(profileHeroMorphPillClassName).toMatch(/\bh-11\b/);
  });

  it('hero input is 44px tall (h-11)', () => {
    expect(subscriptionHeroInputClassName).toMatch(/\bh-11\b/);
  });

  it('hero submit button fits inside the 44px shell (h-9, i.e., 36px)', () => {
    expect(subscriptionHeroSubmitClassName).toMatch(/\bh-9\b/);
    expect(subscriptionHeroSubmitClassName).toMatch(/\bw-9\b/);
  });

  it('hero composer surface is rounded-full for pill shape', () => {
    expect(subscriptionHeroComposerSurfaceClassName).toMatch(
      /\brounded-full\b/
    );
  });

  it('hero composer surface uses white/10 backdrop — not a raw hex', () => {
    expect(subscriptionHeroComposerSurfaceClassName).toMatch(/bg-white\/10\b/);
  });
});
