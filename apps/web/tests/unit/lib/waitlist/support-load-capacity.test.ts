import { describe, expect, it } from 'vitest';
import {
  decideSupportLoadCapacity,
  SUPPORT_LOAD_HOLD_AT,
  SUPPORT_LOAD_NARROW_AT,
} from '@/lib/waitlist/support-load-capacity';

describe('decideSupportLoadCapacity', () => {
  it('keeps the stored limit while bug reports are few', () => {
    expect(
      decideSupportLoadCapacity({ baseDailyLimit: 10, openBugReports: 0 })
    ).toEqual({ band: 'normal', dailyLimit: 10 });
  });

  it('halves the limit once reports reach the narrow threshold', () => {
    expect(
      decideSupportLoadCapacity({
        baseDailyLimit: 9,
        openBugReports: SUPPORT_LOAD_NARROW_AT,
      })
    ).toEqual({ band: 'narrow', dailyLimit: 4 });
  });

  it('pauses admission at the hold threshold', () => {
    expect(
      decideSupportLoadCapacity({
        baseDailyLimit: 10,
        openBugReports: SUPPORT_LOAD_HOLD_AT,
      })
    ).toEqual({ band: 'hold', dailyLimit: 0 });
  });

  it('fails closed to narrow when the count is unreadable', () => {
    expect(
      decideSupportLoadCapacity({ baseDailyLimit: 10, openBugReports: null })
    ).toEqual({ band: 'narrow', dailyLimit: 5 });
  });
});
