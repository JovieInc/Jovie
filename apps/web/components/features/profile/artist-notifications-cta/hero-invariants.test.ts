import { describe, expect, it } from 'vitest';
import { OTP_LENGTH } from '@/features/auth/atoms/otp-input';
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

  /**
   * Width budget for the hero OTP step at 390px viewport (narrowest common
   * mobile). If OTP_LENGTH grows past 6, the cells will overflow the pill
   * and re-introduce the "DOB escapes the boundary" regression.
   *
   *   shell inner width ≈ 298px − 14px padding − 36px submit − 8px gap = 240px
   *   cells width       = N cells × 26px + (N-1) × 3px gap
   *
   * If this ever fails, bump `OTP_LENGTH` carefully: either shrink cell
   * width in the 'hero' size variant or promote OTP to a secondary panel.
   */
  it('OTP cells fit inside the hero shell at current OTP_LENGTH', () => {
    const CELL_WIDTH = 26;
    const CELL_GAP = 3;
    const SHELL_INNER_BUDGET = 240;
    const cellsWidth =
      OTP_LENGTH * CELL_WIDTH + Math.max(0, OTP_LENGTH - 1) * CELL_GAP;
    expect(cellsWidth).toBeLessThanOrEqual(SHELL_INNER_BUDGET);
  });
});
