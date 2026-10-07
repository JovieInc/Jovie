import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  isInstantlyOutboundEnabled,
  isOutreachQuietHours,
} from '@/lib/leads/outbound-gates';

describe('isInstantlyOutboundEnabled', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('stays closed when the flag is unset', () => {
    vi.stubEnv('FEATURE_INSTANTLY_OUTBOUND', '');
    expect(isInstantlyOutboundEnabled()).toBe(false);
  });

  it('stays closed unless the flag is the exact string true', () => {
    vi.stubEnv('FEATURE_INSTANTLY_OUTBOUND', 'TRUE');
    expect(isInstantlyOutboundEnabled()).toBe(false);
    vi.stubEnv('FEATURE_INSTANTLY_OUTBOUND', '1');
    expect(isInstantlyOutboundEnabled()).toBe(false);
  });

  it('opens only when FEATURE_INSTANTLY_OUTBOUND is true', () => {
    vi.stubEnv('FEATURE_INSTANTLY_OUTBOUND', 'true');
    expect(isInstantlyOutboundEnabled()).toBe(true);
  });
});

describe('isOutreachQuietHours', () => {
  const at = (hour: number) => new Date(Date.UTC(2026, 9, 3, hour, 30));

  it('uses the default quiet window (01:00-15:00 UTC) when env is unset', () => {
    const env = {};
    expect(isOutreachQuietHours(at(5), env)).toBe(true);
    expect(isOutreachQuietHours(at(16), env)).toBe(false);
    expect(isOutreachQuietHours(at(0), env)).toBe(false);
  });

  it('wraps midnight when start is after end', () => {
    const env = {
      OUTREACH_QUIET_HOURS_START_UTC: '22',
      OUTREACH_QUIET_HOURS_END_UTC: '6',
    };
    expect(isOutreachQuietHours(at(23), env)).toBe(true);
    expect(isOutreachQuietHours(at(3), env)).toBe(true);
    expect(isOutreachQuietHours(at(12), env)).toBe(false);
  });

  it('treats equal start and end as disabled', () => {
    const env = {
      OUTREACH_QUIET_HOURS_START_UTC: '0',
      OUTREACH_QUIET_HOURS_END_UTC: '0',
    };
    expect(isOutreachQuietHours(at(5), env)).toBe(false);
  });

  it('falls back to defaults on invalid env values', () => {
    const env = {
      OUTREACH_QUIET_HOURS_START_UTC: 'bogus',
      OUTREACH_QUIET_HOURS_END_UTC: '99',
    };
    expect(isOutreachQuietHours(at(5), env)).toBe(true);
    expect(isOutreachQuietHours(at(16), env)).toBe(false);
  });
});
