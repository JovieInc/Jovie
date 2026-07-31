import { describe, expect, it } from 'vitest';
import {
  exceedsUs1099Threshold,
  isMachineAccessDecisionSetFullySignedOff,
  MACHINE_ACCESS_ARTIST_SETTLEMENT,
  MACHINE_ACCESS_ARTIST_SHARE_BPS,
  MACHINE_ACCESS_CONSENT_COPY,
  MACHINE_ACCESS_DECISIONS,
  MACHINE_ACCESS_OPT_IN_DEFAULT,
  MACHINE_ACCESS_PAYOUT_FLOOR_CENTS,
  MACHINE_ACCESS_PLATFORM_SHARE_BPS,
  MACHINE_ACCESS_SHARE_BPS_TOTAL,
  MACHINE_ACCESS_STABLECOIN_POLICY,
  meetsMachineAccessPayoutFloor,
  splitMachineAccessNetCents,
} from './machine-access-payout-policy';

describe('machine-access payout policy', () => {
  it('keeps artist-majority 70/30 basis points totaling 10000', () => {
    expect(MACHINE_ACCESS_ARTIST_SHARE_BPS).toBe(7_000);
    expect(MACHINE_ACCESS_PLATFORM_SHARE_BPS).toBe(3_000);
    expect(
      MACHINE_ACCESS_ARTIST_SHARE_BPS + MACHINE_ACCESS_PLATFORM_SHARE_BPS
    ).toBe(MACHINE_ACCESS_SHARE_BPS_TOTAL);
    expect(MACHINE_ACCESS_ARTIST_SHARE_BPS).toBeGreaterThan(
      MACHINE_ACCESS_PLATFORM_SHARE_BPS
    );
  });

  it('defaults opt-in to OFF', () => {
    expect(MACHINE_ACCESS_OPT_IN_DEFAULT).toBe(false);
  });

  it('uses a $10 USD payout floor and monthly Connect fiat settlement', () => {
    expect(MACHINE_ACCESS_PAYOUT_FLOOR_CENTS).toBe(1_000);
    expect(MACHINE_ACCESS_ARTIST_SETTLEMENT).toBe('fiat_stripe_connect');
    expect(MACHINE_ACCESS_STABLECOIN_POLICY).toBe('platform_redeems_to_fiat');
  });

  it('splits net cents with remainder to the platform', () => {
    expect(splitMachineAccessNetCents(100)).toEqual({
      artistShareCents: 70,
      platformShareCents: 30,
    });
    // 1 cent: floor division → artist 0, platform 1
    expect(splitMachineAccessNetCents(1)).toEqual({
      artistShareCents: 0,
      platformShareCents: 1,
    });
    expect(splitMachineAccessNetCents(0)).toEqual({
      artistShareCents: 0,
      platformShareCents: 0,
    });
  });

  it('rejects invalid split inputs', () => {
    expect(() => splitMachineAccessNetCents(-1)).toThrow(RangeError);
    expect(() => splitMachineAccessNetCents(10.5)).toThrow(RangeError);
    expect(() => splitMachineAccessNetCents(100, 10_001)).toThrow(RangeError);
  });

  it('enforces the payout floor', () => {
    expect(meetsMachineAccessPayoutFloor(999)).toBe(false);
    expect(meetsMachineAccessPayoutFloor(1_000)).toBe(true);
    expect(meetsMachineAccessPayoutFloor(2_500)).toBe(true);
  });

  it('flags U.S. 1099 threshold at $600', () => {
    expect(exceedsUs1099Threshold(59_999)).toBe(false);
    expect(exceedsUs1099Threshold(60_000)).toBe(true);
  });

  it('records four pending Tim decisions and is not fully signed off yet', () => {
    expect(MACHINE_ACCESS_DECISIONS.map(d => d.id)).toEqual([
      'D1',
      'D2',
      'D3',
      'D4',
    ]);
    expect(MACHINE_ACCESS_DECISIONS.every(d => d.state === 'pending_tim')).toBe(
      true
    );
    expect(isMachineAccessDecisionSetFullySignedOff()).toBe(false);
    expect(
      isMachineAccessDecisionSetFullySignedOff(
        MACHINE_ACCESS_DECISIONS.map(d => ({ ...d, state: 'approved' }))
      )
    ).toBe(true);
  });

  it('ships draft consent copy with version and non-empty UI strings', () => {
    expect(MACHINE_ACCESS_CONSENT_COPY.version).toMatch(/draft/i);
    expect(MACHINE_ACCESS_CONSENT_COPY.settingsTitle.length).toBeGreaterThan(0);
    expect(
      MACHINE_ACCESS_CONSENT_COPY.settingsDescription.toLowerCase()
    ).toContain('opt');
    expect(MACHINE_ACCESS_CONSENT_COPY.optInConfirm.toLowerCase()).toContain(
      'authorize'
    );
  });
});
