import { describe, expect, it } from 'vitest';
import { parseCaptureTarget } from './capture-target';

describe('parseCaptureTarget', () => {
  it('parses web capture lines', () => {
    expect(
      parseCaptureTarget(
        'Capture: web https://staging.jov.ie/app/dashboard/earnings'
      )
    ).toEqual({
      platform: 'web',
      value: 'https://staging.jov.ie/app/dashboard/earnings',
    });
  });

  it('parses ios capture lines', () => {
    expect(parseCaptureTarget('Capture: ios profile-dashboard')).toEqual({
      platform: 'ios',
      value: 'profile-dashboard',
    });
  });

  it('parses legacy capture url lines', () => {
    expect(
      parseCaptureTarget('Capture URL: https://staging.jov.ie/exp/shell-v1')
    ).toEqual({
      platform: 'web',
      value: 'https://staging.jov.ie/exp/shell-v1',
    });
  });

  it('returns null when no capture metadata is present', () => {
    expect(
      parseCaptureTarget('Needs a human taste call on typography.')
    ).toBeNull();
  });
});
