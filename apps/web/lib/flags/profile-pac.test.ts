import { describe, expect, it } from 'vitest';
import {
  DEFAULT_PROFILE_PAC_ASSIGNMENT,
  evaluateProfilePacPromotion,
  parseProfilePacAssignment,
} from './profile-pac';

describe('parseProfilePacAssignment', () => {
  it('accepts the five PAC experiment slots from Statsig config', () => {
    expect(
      parseProfilePacAssignment({
        copy_arm: 'alternate',
        trigger_threshold: 'track_complete',
        s2_slot: 'tickets',
        tab_bar: 'hidden',
        dismiss_affordance: 'icon',
        rendering: 'not-allowed',
      })
    ).toEqual({
      copyArm: 'alternate',
      triggerThreshold: 'track_complete',
      s2Slot: 'tickets',
      tabBar: 'hidden',
      dismissAffordance: 'icon',
    });
  });

  it('falls back to defaults for malformed or unknown values', () => {
    expect(
      parseProfilePacAssignment({
        copyArm: 'icon-x',
        triggerThreshold: '5s',
        s2Slot: 'video',
        tabBar: 'maybe',
        dismissAffordance: 'ghost',
      })
    ).toEqual(DEFAULT_PROFILE_PAC_ASSIGNMENT);
  });

  it('defaults component arms when only the original three slots are set', () => {
    expect(
      parseProfilePacAssignment({
        copyArm: 'alternate',
        triggerThreshold: '30s',
        s2Slot: 'merch',
      })
    ).toEqual({
      copyArm: 'alternate',
      triggerThreshold: '30s',
      s2Slot: 'merch',
      tabBar: 'visible',
      dismissAffordance: 'text',
    });
  });
});

describe('evaluateProfilePacPromotion', () => {
  it('promotes an S1 arm when capture lift is significant and guardrails pass', () => {
    const recommendation = evaluateProfilePacPromotion({
      slot: 'copyArm',
      control: {
        arm: 'default',
        exposures: 1000,
        captures: 100,
        dismissals: 90,
      },
      candidate: {
        arm: 'alternate',
        exposures: 1000,
        captures: 150,
        dismissals: 80,
      },
    });

    expect(recommendation).toMatchObject({
      slot: 'copyArm',
      winningArm: 'alternate',
      previousArm: 'default',
      reason: 'capture_rate_significant',
      configPatch: { copyArm: 'alternate' },
      reversible: true,
    });
  });

  it('blocks promotion when capture rate or dismissal rate degrades', () => {
    expect(
      evaluateProfilePacPromotion({
        slot: 'triggerThreshold',
        control: {
          arm: '30s',
          exposures: 1000,
          captures: 100,
          dismissals: 90,
        },
        candidate: {
          arm: 'track_complete',
          exposures: 1000,
          captures: 99,
          dismissals: 80,
        },
      })
    ).toBeNull();

    expect(
      evaluateProfilePacPromotion({
        slot: 'triggerThreshold',
        control: {
          arm: '30s',
          exposures: 1000,
          captures: 100,
          dismissals: 90,
        },
        candidate: {
          arm: 'track_complete',
          exposures: 1000,
          captures: 140,
          dismissals: 91,
        },
      })
    ).toBeNull();
  });

  it('requires trusted S2 reward lift and significance before promotion', () => {
    expect(
      evaluateProfilePacPromotion({
        slot: 's2Slot',
        control: {
          arm: 'merch',
          exposures: 1000,
          captures: 100,
          dismissals: 90,
          revenueCents: 20_000,
        },
        candidate: {
          arm: 'tickets',
          exposures: 1000,
          captures: 150,
          dismissals: 80,
          revenueCents: 35_000,
        },
      })
    ).toMatchObject({
      reason: 'revenue_reward_significant',
      configPatch: { s2Slot: 'tickets' },
    });

    expect(
      evaluateProfilePacPromotion({
        slot: 's2Slot',
        control: {
          arm: 'merch',
          exposures: 1000,
          captures: 100,
          dismissals: 90,
          revenueCents: 20_000,
        },
        candidate: {
          arm: 'tickets',
          exposures: 1000,
          captures: 150,
          dismissals: 80,
          revenueCents: 20_100,
        },
        minRewardLiftCents: 1,
      })
    ).toBeNull();
  });

  it('promotes tab-bar arm only when play + capture both win and engagement holds', () => {
    expect(
      evaluateProfilePacPromotion({
        slot: 'tabBar',
        control: {
          arm: 'visible',
          exposures: 1000,
          captures: 100,
          dismissals: 90,
          plays: 200,
          engagements: 600,
        },
        candidate: {
          arm: 'hidden',
          exposures: 1000,
          captures: 150,
          dismissals: 80,
          plays: 280,
          engagements: 620,
        },
      })
    ).toMatchObject({
      reason: 'play_and_capture_rate_significant',
      configPatch: { tabBar: 'hidden' },
    });

    // Engagement floor violated → no promote.
    expect(
      evaluateProfilePacPromotion({
        slot: 'tabBar',
        control: {
          arm: 'visible',
          exposures: 1000,
          captures: 100,
          dismissals: 90,
          plays: 200,
          engagements: 600,
        },
        candidate: {
          arm: 'hidden',
          exposures: 1000,
          captures: 150,
          dismissals: 80,
          plays: 280,
          engagements: 500,
        },
      })
    ).toBeNull();
  });

  it('promotes dismiss affordance on capture lift without raising dismissals', () => {
    expect(
      evaluateProfilePacPromotion({
        slot: 'dismissAffordance',
        control: {
          arm: 'text',
          exposures: 1000,
          captures: 100,
          dismissals: 90,
        },
        candidate: {
          arm: 'icon',
          exposures: 1000,
          captures: 150,
          dismissals: 80,
        },
      })
    ).toMatchObject({
      reason: 'capture_rate_significant',
      configPatch: { dismissAffordance: 'icon' },
    });

    // Dark pattern: capture up but dismissals up → blocked.
    expect(
      evaluateProfilePacPromotion({
        slot: 'dismissAffordance',
        control: {
          arm: 'text',
          exposures: 1000,
          captures: 100,
          dismissals: 90,
        },
        candidate: {
          arm: 'icon',
          exposures: 1000,
          captures: 150,
          dismissals: 120,
        },
      })
    ).toBeNull();
  });
});
