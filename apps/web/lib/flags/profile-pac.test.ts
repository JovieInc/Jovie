import { describe, expect, it } from 'vitest';
import {
  DEFAULT_PROFILE_PAC_ASSIGNMENT,
  evaluateProfilePacPromotion,
  parseProfilePacAssignment,
} from './profile-pac';

describe('parseProfilePacAssignment', () => {
  it('accepts only the three locked PAC slots from Statsig config', () => {
    expect(
      parseProfilePacAssignment({
        copy_arm: 'alternate',
        trigger_threshold: 'track_complete',
        s2_slot: 'tickets',
        rendering: 'not-allowed',
      })
    ).toEqual({
      copyArm: 'alternate',
      triggerThreshold: 'track_complete',
      s2Slot: 'tickets',
    });
  });

  it('falls back to defaults for malformed or unknown values', () => {
    expect(
      parseProfilePacAssignment({
        copyArm: 'icon-x',
        triggerThreshold: '5s',
        s2Slot: 'video',
      })
    ).toEqual(DEFAULT_PROFILE_PAC_ASSIGNMENT);
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
});
