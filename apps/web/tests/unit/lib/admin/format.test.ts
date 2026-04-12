import { describe, expect, it } from 'vitest';
import { formatPercent, formatUsd } from '@/lib/admin/format';

describe('formatPercent', () => {
  it('formats a decimal rate as percentage', () => {
    expect(formatPercent(0.423)).toBe('42.3%');
  });

  it('returns em dash for null', () => {
    expect(formatPercent(null)).toBe('\u2014');
  });

  it('formats zero as 0.0%', () => {
    expect(formatPercent(0)).toBe('0.0%');
  });

  it('formats 1.0 as 100.0%', () => {
    expect(formatPercent(1)).toBe('100.0%');
  });
});

describe('formatUsd', () => {
  it('formats small values with cents', () => {
    expect(formatUsd(0.5)).toBe('$0.50');
  });

  it('formats values under 1000 with cents', () => {
    expect(formatUsd(847)).toBe('$847.00');
  });

  it('formats values at 1000+ without cents', () => {
    expect(formatUsd(1234)).toBe('$1,234');
  });

  it('formats large values with grouping', () => {
    expect(formatUsd(12345)).toBe('$12,345');
  });
});
