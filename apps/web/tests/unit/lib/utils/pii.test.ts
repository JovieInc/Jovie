import { describe, expect, it } from 'vitest';

import {
  logSafeCode,
  logSafePhone,
  maskPhoneForDisplay,
} from '@/lib/utils/pii';

describe('logSafePhone', () => {
  it('returns empty string for missing input', () => {
    expect(logSafePhone(null)).toBe('');
    expect(logSafePhone(undefined)).toBe('');
    expect(logSafePhone('')).toBe('');
    expect(logSafePhone('   ')).toBe('');
  });

  it('preserves +1 country prefix and last 4 digits', () => {
    expect(logSafePhone('+15555550100')).toBe('+15*****0100');
  });

  it('preserves +44 country prefix and last 4 digits', () => {
    expect(logSafePhone('+447700900123')).toBe('+44******0123');
  });

  it('does not crash on very short inputs', () => {
    expect(logSafePhone('1')).toBe('***');
    expect(logSafePhone('+1')).toBe('***');
  });

  it('never reveals the middle digits', () => {
    const masked = logSafePhone('+15555550100');
    expect(masked).not.toContain('555');
    expect(masked).toContain('0100');
  });
});

describe('logSafeCode', () => {
  it('returns empty for missing input', () => {
    expect(logSafeCode(null)).toBe('');
    expect(logSafeCode(undefined)).toBe('');
    expect(logSafeCode('')).toBe('');
  });

  it('reveals only first and last char', () => {
    expect(logSafeCode('J7K4Q2HZ')).toBe('J******Z');
  });

  it('handles 2-char codes', () => {
    expect(logSafeCode('AB')).toBe('**');
  });
});

describe('maskPhoneForDisplay', () => {
  it('returns empty for missing input', () => {
    expect(maskPhoneForDisplay(null)).toBe('');
    expect(maskPhoneForDisplay(undefined)).toBe('');
    expect(maskPhoneForDisplay('')).toBe('');
  });

  it('formats as ••• <last4>', () => {
    expect(maskPhoneForDisplay('+15555550100')).toBe('••• 0100');
  });
});
